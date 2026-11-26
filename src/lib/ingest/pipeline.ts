/**
 * Ingestion pipeline (runs in the worker or on manual input):
 * snapshot → language → translation → dedup → classify/extract → org resolution → score → play.
 */
import { sql } from '@/db';
import { classify, headlineSubject, isArabic, type Extraction } from '../engine/classify';
import { contentHash, fingerprint, SAME_STORY } from '../engine/dedup';
import { scoreSignal } from '../engine/score';
import { buildPlay, type Offer, type RateCard } from '../engine/play';
import { getSettings } from '../settings';
import { aiClassify, aiTranslate } from '../ai/tasks';
import { aiAvailable } from '../ai/client';
import { COUNTRIES, SIGNAL_TYPES, type SignalType, type Sector } from '../taxonomy';

export type RawItem = {
  sourceId: string | null; url: string; title: string; excerpt: string; body?: string | null; publishedAt: Date | null;
  outlet?: string | null; origin: 'crawl' | 'manual_url' | 'upload' | 'demo'; addedBy?: string | null; storeBody?: boolean; isDemo?: boolean;
};

export async function ingestItem(item: RawItem): Promise<{ status: 'duplicate_snapshot' | 'not_signal' | 'merged' | 'new'; signalId?: string; playId?: string | null }> {
  const hash = contentHash(item.url, item.title);
  const [exists] = await sql`SELECT id FROM snapshots WHERE content_hash = ${hash}`;
  if (exists) return { status: 'duplicate_snapshot' };
  const text = `${item.title}\n${item.excerpt}\n${item.body ?? ''}`.trim();
  const lang = isArabic(`${item.title} ${item.excerpt}`) ? 'ar' : 'en';
  const publishedAt = item.publishedAt && !isNaN(item.publishedAt.getTime()) && item.publishedAt <= new Date() ? item.publishedAt : null;

  const [snap] = await sql`
    INSERT INTO snapshots (source_id, url, title, excerpt, body, lang, content_hash, published_at, origin, added_by, is_demo)
    VALUES (${item.sourceId}, ${item.url}, ${item.title.slice(0, 500)}, ${item.excerpt.slice(0, 1200)}, ${item.storeBody ? (item.body ?? null) : null},
            ${lang}, ${hash}, ${publishedAt}, ${item.origin}, ${item.addedBy ?? null}, ${item.isDemo ?? false})
    ON CONFLICT (content_hash) DO NOTHING RETURNING id`;
  if (!snap) return { status: 'duplicate_snapshot' };

  // Translation: Arabic → English (and English → Arabic on demand from the UI)
  if (lang === 'ar' && aiAvailable()) {
    const tr = await aiTranslate(snap.id, item.title, item.excerpt, 'English');
    if (tr) await sql`UPDATE snapshots SET title_translated = ${tr.title}, excerpt_translated = ${tr.excerpt} WHERE id = ${snap.id}`;
  }

  // Dedup: same fingerprint or trigram-similar title within 21 days → merge as corroborating source
  const fp = fingerprint(item.title);
  const [dup] = await sql`
    SELECT id FROM signals
    WHERE first_seen_at > now() - interval '21 days' AND (fingerprint = ${fp} OR similarity(title, ${item.title}) >= ${SAME_STORY}
      OR (title_en IS NOT NULL AND similarity(title_en, ${item.title}) >= ${SAME_STORY}))
    ORDER BY similarity(title, ${item.title}) DESC LIMIT 1`;
  if (dup) {
    await sql`INSERT INTO signal_sources (signal_id, snapshot_id) VALUES (${dup.id}, ${snap.id}) ON CONFLICT DO NOTHING`;
    await rescoreSignal(dup.id);
    return { status: 'merged', signalId: dup.id };
  }

  const competitors = await sql`SELECT name, aliases FROM competitors`;
  const compNames = competitors.flatMap((c) => [c.name, ...c.aliases]);
  let ex: Extraction = classify(text, compNames);
  let method = 'rules';
  let orgAr: string | null = null;
  const ai = aiAvailable() ? await aiClassify(snap.id, item.title, `${item.excerpt}\n${item.body ?? ''}`) : null;
  if (ai && ai.confidence >= 0.5) {
    method = 'ai';
    ex = { ...ex, signalType: ai.signal_type, sector: ai.sector, country: ai.country || ex.country, orgType: ai.org_type as any,
      orgNames: ai.organisation_en ? [ai.organisation_en, ...ex.orgNames] : ex.orgNames, amountText: ai.amount_text ?? ex.amountText,
      deadline: ai.deadline ?? ex.deadline, matched: ai.evidence.length ? ai.evidence : ex.matched, ruleStrength: ai.confidence };
    orgAr = ai.organisation_ar;
  }

  // Entity resolution: first, known organisations whose EN/AR name or alias appears verbatim in the text; then extracted names.
  const lower = text.toLowerCase();
  const [known] = await sql`
    SELECT id FROM organisations
    WHERE length(name_en) >= 4 AND (strpos(${lower}, lower(name_en)) > 0 OR (name_ar IS NOT NULL AND strpos(${text}, name_ar) > 0)
      OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE length(a) >= 3 AND strpos(${lower}, lower(a)) > 0))
    ORDER BY is_competitor ASC, length(name_en) DESC LIMIT 1`;
  if (!ex.relevant && method === 'rules') return { status: 'not_signal' }; // stored as evidence, but not a buying signal
  if (ex.country === 'XX' && item.sourceId) { const [src] = await sql`SELECT country FROM sources WHERE id = ${item.sourceId}`; if (src && known) ex.country = src.country; }
  // Order: a known organisation named verbatim → the headline's subject (the "logo") → other extracted names.
  const subject = headlineSubject(item.title);
  const orgId = known?.id ?? (subject ? await resolveOrg(subject, orgAr, ex) : ex.orgNames.length ? await resolveOrg(ex.orgNames[0], orgAr, ex) : null);
  if (orgId) {
    // Known organisation profile beats text heuristics for sector / type / country.
    const [o] = await sql`SELECT sector, org_type, country FROM organisations WHERE id = ${orgId}`;
    if (o && o.sector !== 'other' && (ex.sector === 'other' || known)) ex.sector = o.sector;
    if (o && known) { ex.orgType = o.org_type; if (ex.track === 'smb' && ['government', 'semi_government', 'private'].includes(o.org_type) && !['funding', 'hiring_cs', 'new_licence', 'cross_border'].includes(ex.signalType)) ex.track = 'enterprise'; }
  }
  // A competitor win at an organisation where we have an open deal is a signal AGAINST that deal.
  if (ex.signalType === 'competitor_move' && orgId && /(award|win|won|secur|ترسية|فاز)/i.test(text)) {
    const [open] = await sql`SELECT 1 FROM deals WHERE org_id = ${orgId} AND status = 'open' LIMIT 1`;
    if (open) ex.signalType = 'competitor_award';
  }
  // Same organisation + same event type within 14 days = same story told differently → merge.
  if (orgId) {
    const [same] = await sql`SELECT id FROM signals WHERE org_id = ${orgId} AND signal_type = ${ex.signalType} AND first_seen_at > now() - interval '14 days' LIMIT 1`;
    if (same) { await sql`INSERT INTO signal_sources (signal_id, snapshot_id) VALUES (${same.id}, ${snap.id}) ON CONFLICT DO NOTHING`; await rescoreSignal(same.id); return { status: 'merged', signalId: same.id }; }
  }
  const track = ex.competitors.length && ex.signalType === 'competitor_move' ? 'competitor' : SIGNAL_TYPES[ex.signalType] === 'against' ? 'against' : ex.track;

  const [sig] = await sql`
    INSERT INTO signals (title, title_en, summary, lang, signal_type, track, org_id, country, sector, amount_usd, deadline, published_at, fingerprint, classification_method, extracted, is_demo)
    VALUES (${item.title.slice(0, 500)}, ${null}, ${item.excerpt.slice(0, 600)}, ${lang}, ${ex.signalType}, ${track}, ${orgId}, ${ex.country}, ${ex.sector},
            ${ex.amountUsd}, ${ex.deadline}, ${publishedAt}, ${fp}, ${method},
            ${sql.json({ orgNames: subject ? [subject, ...ex.orgNames] : ex.orgNames, international: ex.international, competitors: ex.competitors, amountText: ex.amountText, matched: ex.matched, roles: ex.roles, orgType: ex.orgType, ruleStrength: ex.ruleStrength } as any)}, ${item.isDemo ?? false})
    RETURNING id`;
  await sql`INSERT INTO signal_sources (signal_id, snapshot_id) VALUES (${sig.id}, ${snap.id})`;
  await sql`UPDATE signals s SET title_en = sn.title_translated FROM snapshots sn WHERE s.id = ${sig.id} AND sn.id = ${snap.id} AND sn.title_translated IS NOT NULL`;
  const { playId } = await rescoreSignal(sig.id);

  if (track === 'against' && orgId) {
    const deals = await sql`SELECT id, owner_id, title FROM deals WHERE org_id = ${orgId} AND status = 'open'`;
    for (const d of deals) {
      await sql`INSERT INTO deal_signals (deal_id, signal_id) VALUES (${d.id}, ${sig.id}) ON CONFLICT DO NOTHING`;
      if (d.owner_id) await sql`INSERT INTO notifications (user_id, kind, title, href) VALUES (${d.owner_id}, 'against', ${`Signal against “${d.title}”: ${item.title.slice(0, 120)}`}, ${`/deals/${d.id}`})`;
    }
  }
  return { status: 'new', signalId: sig.id, playId };
}

export async function resolveOrg(name: string, nameAr: string | null, ex: Extraction): Promise<string> {
  const clean = name.replace(/\s+/g, ' ').trim();
  const [m] = await sql`
    SELECT id FROM organisations
    WHERE lower(name_en) = lower(${clean}) OR name_ar = ${clean} OR ${clean} ILIKE ANY(aliases)
       OR similarity(name_en, ${clean}) > 0.6 OR (name_ar IS NOT NULL AND similarity(name_ar, ${clean}) > 0.6)
    ORDER BY similarity(name_en, ${clean}) DESC LIMIT 1`;
  if (m) { if (nameAr) await sql`UPDATE organisations SET name_ar = coalesce(name_ar, ${nameAr}) WHERE id = ${m.id}`; return m.id; }
  const isAr = isArabic(clean);
  const [o] = await sql`
    INSERT INTO organisations (name_en, name_ar, sector, country, org_type, is_competitor)
    VALUES (${clean}, ${isAr ? clean : nameAr}, ${ex.sector}, ${ex.country}, ${ex.orgType}, ${ex.competitors.some((c) => clean.toLowerCase().includes(c.toLowerCase()))})
    RETURNING id`;
  return o.id;
}

/** Recompute scores (after new corroboration, relationship or weight change) and create/update the play. */
export async function rescoreSignal(signalId: string): Promise<{ playId: string | null }> {
  const s = await getSettings();
  const [sig] = await sql`SELECT s.*, o.name_en AS org_name, o.name_ar AS org_name_ar, o.org_type, o.size_band FROM signals s LEFT JOIN organisations o ON o.id = s.org_id WHERE s.id = ${signalId}`;
  if (!sig) return { playId: null };
  const sources = await sql`
    SELECT sn.id, sn.title, sn.url, sn.published_at, coalesce(src.quality, CASE WHEN sn.origin = 'upload' THEN 3 ELSE 2 END) AS quality, coalesce(src.name, split_part(regexp_replace(sn.url, '^https?://(www\\.)?', ''), '/', 1)) AS outlet
    FROM signal_sources ss JOIN snapshots sn ON sn.id = ss.snapshot_id LEFT JOIN sources src ON src.id = sn.source_id
    WHERE ss.signal_id = ${signalId} ORDER BY sn.published_at DESC NULLS LAST`;
  const rel = sig.org_id ? await sql`SELECT strength FROM relationships WHERE org_id = ${sig.org_id}` : [];
  const strongest = (['strong', 'medium', 'weak'] as const).find((k) => rel.some((r) => r.strength === k)) ?? null;
  const ev = await sql`SELECT name, keywords FROM events WHERE end_date >= current_date AND start_date <= current_date + 120`;
  const text = `${sig.title} ${sig.summary}`;
  const atEvent = ev.find((e) => e.keywords.some((k: string) => text.includes(k)))?.name ?? null;
  const ext = sig.extracted ?? {};
  const orgType = sig.org_type ?? ext.orgType ?? 'private';
  const track = (sig.track === 'against' ? 'enterprise' : sig.track) as 'enterprise' | 'smb' | 'competitor';
  const res = scoreSignal({
    signalType: sig.signal_type as SignalType, sector: sig.sector as Sector, country: sig.country, orgType, sizeBand: sig.size_band ?? 'unknown',
    arabic: sig.lang === 'ar', sourceCount: sources.length, bestSourceQuality: Math.max(1, ...sources.map((x) => Number(x.quality))),
    ruleStrength: Number(ext.ruleStrength ?? 0.6), amountUsd: sig.amount_usd ? Number(sig.amount_usd) : null, deadline: sig.deadline ? new Date(sig.deadline).toISOString().slice(0, 10) : null,
    publishedAt: sources[sources.length - 1]?.published_at ? new Date(sources[sources.length - 1].published_at) : sig.published_at ? new Date(sig.published_at) : null,
    roles: ext.roles ?? null, access: { strongest, count: rel.length, atEvent },
  }, s.weights[track] ?? s.weights.enterprise, s.tiers);
  await sql`UPDATE signals SET scores = ${sql.json(res.scores as any)}, total = ${res.total}, tier = ${res.tier}, confidence = ${res.confidence} WHERE id = ${signalId}`;

  const inRegion = (COUNTRIES as readonly string[]).includes(sig.country);
  if (sig.track === 'against' || res.total < s.playThreshold || !inRegion) {
    await sql`UPDATE plays SET scores = ${sql.json(res.scores as any)}, total = ${res.total}, tier = ${res.tier}, confidence = ${res.confidence} WHERE signal_id = ${signalId}`;
    const [p] = await sql`SELECT id FROM plays WHERE signal_id = ${signalId}`;
    return { playId: p?.id ?? null };
  }
  const offers = (await sql`SELECT * FROM offers WHERE active`) as unknown as Offer[];
  const rates = (await sql`SELECT * FROM rate_cards`) as unknown as RateCard[];
  const play = buildPlay({
    signalType: sig.signal_type, track: sig.track, sector: sig.sector, country: sig.country, orgType, sizeBand: sig.size_band ?? 'unknown',
    orgName: sig.org_name, orgNameAr: sig.org_name_ar, title: sig.title, titleEn: sig.title_en, amountText: ext.amountText ?? null, amountUsd: sig.amount_usd,
    deadline: sig.deadline ? new Date(sig.deadline).toISOString().slice(0, 10) : null, roles: ext.roles ?? null,
    sources: sources.map((x) => ({ snapshotId: x.id, title: x.title, url: x.url, publishedAt: x.published_at, outlet: x.outlet })),
    scores: res.scores, confidence: res.confidence, competitors: ext.competitors ?? [],
  }, offers, rates);
  const owner = await suggestOwner(sig.country, sig.sector);
  const [p] = await sql`
    INSERT INTO plays (signal_id, org_id, headline, headline_ar, why_now, buyer_roles, offer_keys, proof_point, value_low_usd, value_high_usd, size_band, scores, total, tier, confidence, owner_id, outreach, risks, is_demo)
    VALUES (${signalId}, ${sig.org_id}, ${play.headline}, ${play.headline_ar}, ${sql.json(play.why_now as any)}, ${play.buyer_roles}, ${play.offer_keys}, ${play.proof_point},
            ${play.value_low_usd}, ${play.value_high_usd}, ${play.size_band}, ${sql.json(res.scores as any)}, ${res.total}, ${res.tier}, ${res.confidence}, ${owner},
            ${sql.json(play.outreach as any)}, ${sql.json(play.risks as any)}, ${sig.is_demo})
    ON CONFLICT (signal_id) DO UPDATE SET scores = EXCLUDED.scores, total = EXCLUDED.total, tier = EXCLUDED.tier, confidence = EXCLUDED.confidence,
      why_now = EXCLUDED.why_now, risks = EXCLUDED.risks, value_low_usd = EXCLUDED.value_low_usd, value_high_usd = EXCLUDED.value_high_usd
    RETURNING id, (xmax = 0) AS inserted`;
  if (p.inserted && owner) await sql`INSERT INTO notifications (user_id, kind, title, href) VALUES (${owner}, 'play', ${play.headline.slice(0, 160)}, ${`/plays/${p.id}`})`;
  return { playId: p.id };
}

/** Owner by territory/sector rules: AE/BDR/Director whose countries (and sectors, if set) match; least open plays wins. */
export async function suggestOwner(country: string, sector: string): Promise<string | null> {
  const [u] = await sql`
    SELECT u.id FROM users u
    LEFT JOIN plays p ON p.owner_id = u.id AND p.status = 'new'
    WHERE u.active AND u.role IN ('ae','bdr','director') AND ${country} = ANY(u.countries) AND (cardinality(u.sectors) = 0 OR ${sector} = ANY(u.sectors))
    GROUP BY u.id, u.role ORDER BY (u.role = 'director') ASC, count(p.id) ASC LIMIT 1`;
  return u?.id ?? null;
}
