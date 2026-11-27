/**
 * Exports the data behind the hosted Meridian Radar page (radar-app/): plays, logos (by sector, with qualification),
 * market trends mapped to Concentrix offers, and sweep metadata. Run after `npm run ingest:once`.
 * Usage: npm run export:radar [-- --out radar-app]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { sql } from '../src/db';
import { classify, headlineSubject, isCompanyNews, isInternational } from '../src/lib/engine/classify';
import { COUNTRIES, DELIVERY_COUNTRIES } from '../src/lib/taxonomy';
import { buyerCheck, AR_ALIASES } from '../src/lib/engine/clean';

const outDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'radar-app';
mkdirSync(outDir, { recursive: true });
const MET = new Set<string>(COUNTRIES as readonly string[]);
const short = (id: string) => id.slice(0, 8);

// ---- plays (unchanged shape used by the Radar view)
const plays = await sql`
  SELECT p.id, p.headline, p.headline_ar, s.title, s.lang, s.signal_type AS type, s.track, s.country, s.sector, o.name_en AS org, o.name_ar AS org_ar,
    p.total, p.tier, p.confidence, p.scores, p.why_now AS why, p.risks, p.buyer_roles AS buyers, p.offer_keys AS offers, p.proof_point, p.value_low_usd, p.value_high_usd, p.size_band AS band, p.outreach,
    (SELECT json_agg(json_build_object('id', left(sn.id::text, 8), 'title', sn.title, 'excerpt', left(sn.excerpt, 500), 'url', sn.url, 'outlet', coalesce(src.name, ''), 'date', coalesce(sn.published_at, sn.fetched_at), 'lang', sn.lang) ORDER BY sn.published_at)
       FROM signal_sources ss JOIN snapshots sn ON sn.id = ss.snapshot_id LEFT JOIN sources src ON src.id = sn.source_id WHERE ss.signal_id = s.id) AS sources,
    (SELECT json_agg(json_build_object('name', pe.name, 'title', pe.title, 'url', pe.source_url) ORDER BY pe.seen_at DESC) FROM people pe WHERE pe.org_id = p.org_id AND NOT pe.is_demo) AS people,
    s.published_at, s.first_seen_at
  FROM plays p JOIN signals s ON s.id = p.signal_id LEFT JOIN organisations o ON o.id = p.org_id
  WHERE NOT s.is_demo AND coalesce(s.published_at, s.first_seen_at) > now() - interval '60 days' ORDER BY p.total DESC`;
// ---- signals (buying signals) with their logo
const signals = await sql`
  SELECT s.id, s.title, s.signal_type AS type, s.track, s.country, s.sector, s.total, s.tier, s.extracted, s.first_seen_at, o.id AS org_id, o.name_en, o.name_ar, o.is_competitor,
    p.id AS play_id, p.offer_keys,
    (SELECT json_build_object('url', sn.url, 'outlet', coalesce(src.name, ''), 'date', coalesce(sn.published_at, sn.fetched_at)) FROM signal_sources ss JOIN snapshots sn ON sn.id = ss.snapshot_id LEFT JOIN sources src ON src.id = sn.source_id WHERE ss.signal_id = s.id ORDER BY sn.published_at DESC NULLS LAST LIMIT 1) AS src
  FROM signals s LEFT JOIN organisations o ON o.id = s.org_id LEFT JOIN plays p ON p.signal_id = s.id
  WHERE NOT s.is_demo AND s.track <> 'against'
    AND coalesce(s.published_at, s.first_seen_at) > now() - interval '60 days'`;

type Upd = { title: string; url: string; outlet: string; date: string; type: string; total: number | null; playId: string | null };
type Logo = { id: string; name: string; sector: string; country: string; international: boolean; competitor: boolean; maxScore: number; tier: string | null; offers: Set<string>; updates: Upd[]; playIds: string[] };
const logos = new Map<string, Logo>();
const aliasRows = await sql`SELECT name_en, aliases FROM organisations WHERE cardinality(aliases) > 0`;
const ALIAS = new Map<string, string>(aliasRows.flatMap((o) => o.aliases.map((a: string) => [a.toLowerCase(), o.name_en] as [string, string])));
for (const [ar, en] of Object.entries(AR_ALIASES)) ALIAS.set(ar.toLowerCase(), en);
const canon = (n: string) => ALIAS.get(n.toLowerCase().trim()) ?? n;
const key = (n: string) => canon(n).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const allPlays = plays.map((p) => ({
  id: short(p.id), headline: p.headline, headline_ar: p.headline_ar, title: p.title, lang: p.lang, type: p.type, track: p.track, country: p.country, sector: p.sector,
  org: p.org ? canon(p.org) : p.org, org_ar: p.org_ar, total: p.total, tier: p.tier, confidence: p.confidence, scores: p.scores, why: p.why, risks: p.risks, buyers: p.buyers, offers: p.offers,
  proof: p.proof_point ? JSON.parse(p.proof_point) : null, low: Math.round(Number(p.value_low_usd)), high: Math.round(Number(p.value_high_usd)), band: p.band, outreach: p.outreach, sources: p.sources ?? [], people: (p.people ?? []).slice(0, 6), seen: p.published_at ?? p.first_seen_at,
}));

// ---- clean buyers only: a named organisation we can sell to, one opportunity per logo (other signals become 'more' updates)
const screened: Record<string, number> = {};
const byOrg = new Map<string, any>();
for (const p of allPlays) {
  const v = buyerCheck({ org: p.org, title: p.title, type: p.type, offers: p.offers });
  if (!v.clean) { screened[v.reason!] = (screened[v.reason!] ?? 0) + 1; continue; }
  const k = key(p.org!);
  const cur = byOrg.get(k);
  if (!cur) { byOrg.set(k, { ...p, related: [] }); continue; }
  screened.merged = (screened.merged ?? 0) + 1;
  const [keepP, other] = p.total > cur.total ? [{ ...p, related: cur.related }, cur] : [cur, p];
  keepP.related.push({ id: other.id, title: other.title, type: other.type, total: other.total, url: other.sources?.[0]?.url ?? null, date: other.seen });
  const urls = new Set(keepP.sources.map((x: any) => x.url));
  for (const src of other.sources ?? []) if (!urls.has(src.url)) keepP.sources.push(src);
  const names = new Set(keepP.people.map((x: any) => x.name.toLowerCase()));
  for (const pe of other.people ?? []) if (!names.has(pe.name.toLowerCase())) keepP.people.push(pe);
  keepP.offers = [...new Set([...(keepP.offers ?? []), ...(other.offers ?? [])])];
  byOrg.set(k, keepP);
}
const playsOut = [...byOrg.values()].sort((a, b) => b.total - a.total);
const keptId = new Map<string, string>(playsOut.flatMap((p) => [[p.id, p.id], ...p.related.map((r: any) => [r.id, p.id])] as [string, string][]));

const add = (name: string, base: Omit<Logo, 'offers' | 'updates' | 'playIds' | 'maxScore' | 'tier' | 'name' | 'id'>, u: Upd, score: number | null, tier: string | null, offers: string[]) => {
  const k = key(name);
  const l = logos.get(k) ?? { id: Buffer.from(k).toString('base64url').slice(0, 16), name: canon(name), ...base, maxScore: 0, tier: null, offers: new Set<string>(), updates: [], playIds: [] };
  if (score != null && score > l.maxScore) { l.maxScore = score; l.tier = tier; }
  offers.forEach((o) => l.offers.add(o));
  if (!l.updates.some((x) => x.url === u.url)) l.updates.push(u);
  if (u.playId && !l.playIds.includes(u.playId)) l.playIds.push(u.playId);
  l.international ||= base.international;
  if (base.sector !== 'other' && l.sector === 'other') l.sector = base.sector;
  logos.set(k, l);
};
for (const s of signals) {
  if (!s.name_en || !MET.has(s.country) || s.is_competitor) continue;
  add(s.name_en, { sector: s.sector, country: s.country, international: isInternational(s.title, s.name_en), competitor: !!s.is_competitor },
    { title: s.title, url: s.src?.url ?? '', outlet: s.src?.outlet ?? '', date: s.src?.date ?? s.first_seen_at, type: s.type, total: s.total, playId: s.play_id ? short(s.play_id) : null },
    s.total, s.tier, s.offer_keys ?? []);
}
// ---- company news that is not (yet) a buying signal: makes the logo list inclusive ("Watching")
const news = await sql`
  SELECT sn.title, sn.excerpt, sn.url, coalesce(src.name, '') AS outlet, coalesce(sn.published_at, sn.fetched_at) AS date, src.country AS src_country
  FROM snapshots sn LEFT JOIN sources src ON src.id = sn.source_id
  WHERE NOT sn.is_demo AND NOT EXISTS (SELECT 1 FROM signal_sources ss WHERE ss.snapshot_id = sn.id) AND coalesce(sn.published_at, sn.fetched_at) > now() - interval '30 days'`;
const comps = (await sql`SELECT name, aliases FROM competitors`).flatMap((c) => [c.name, ...c.aliases]);
for (const n of news) {
  const subj = headlineSubject(n.title);
  if (!isCompanyNews(n.title, subj)) continue;
  const ex = classify(`${n.title}\n${n.excerpt}`, comps);
  if (!MET.has(ex.country) || ex.competitors.length || ex.sector === 'other') continue; // company-like and in region only
  add(subj!, { sector: ex.sector, country: ex.country, international: isInternational(n.title, subj), competitor: false },
    { title: n.title, url: n.url, outlet: n.outlet, date: n.date, type: 'news', total: null, playId: null }, null, null, []);
}
const logosOut = [...logos.values()].filter((l) => { const v = buyerCheck({ org: l.name, title: '', type: 'news', offers: ['x'] }); return v.clean; }).map((l) => {
  l.playIds = [...new Set(l.playIds.map((id) => keptId.get(id)).filter(Boolean) as string[])];
  const delivery = DELIVERY_COUNTRIES.includes(l.country);
  const signal = l.maxScore >= 55 && l.playIds.length > 0;
  const sellable = l.offers.size > 0;
  return {
    id: l.id, name: l.name, sector: l.sector, country: l.country, international: l.international, maxScore: l.maxScore, tier: l.tier,
    offers: [...l.offers], playIds: l.playIds,
    checks: { delivery, signal, sellable }, qualifies: delivery && signal && sellable,
    updates: l.updates.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6),
  };
}).sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || b.maxScore - a.maxScore || a.name.localeCompare(b.name));

// ---- market trends mapped to offers we can sell and deliver
const THEMES = [
  { k: 'gov_ai', en: 'Government AI & digital services', ar: 'الذكاء الاصطناعي والخدمات الحكومية الرقمية', m: (s: any) => s.type === 'gov_cx_programme' || (s.sector === 'government' && ['expansion', 'new_entity', 'leader_appointed'].includes(s.type)), offers: ['ix_hello', 'cx_strategy', 'ix_hero'] },
  { k: 'cx_ops', en: 'Contact-centre & CX transformation', ar: 'تحويل مراكز الاتصال وتجربة العملاء', m: (s: any) => ['cc_transformation', 'service_ratings', 'complaints'].includes(s.type) || (['tender', 'tender_award'].includes(s.type) && /customer|contact|call cent|service|experience|CX|digital|خدمة|مركز اتصال|المتعاملين/i.test(s.title)), offers: ['managed_cc', 'ix_hero', 'cx_health_check'] },
  { k: 'health', en: 'Healthcare consolidation & new capacity', ar: 'اندماجات الرعاية الصحية والسعة الجديدة', m: (s: any) => s.sector === 'healthcare', offers: ['managed_cc', 'cx_health_check', 'ix_hello'] },
  { k: 'bank_mna', en: 'Banking & financial M&A', ar: 'الاستحواذ والاندماج في القطاع المالي', m: (s: any) => s.type === 'mna' && ['bfsi', 'fintech'].includes(s.sector), offers: ['managed_cc', 'cx_strategy', 'collections'] },
  { k: 'funding', en: 'Startup & fintech funding', ar: 'تمويل الشركات الناشئة والتقنية المالية', m: (s: any) => s.type === 'funding', offers: ['b2b_b2c_sales', 'managed_cc', 'collections', 'trust_safety'] },
  { k: 'intl', en: 'International firms setting up in the UAE', ar: 'شركات عالمية تؤسس حضورها في الإمارات', m: (s: any) => isInternational(s.title, s.name_en) || s.type === 'regional_hq', offers: ['managed_cc', 'b2b_b2c_sales', 'cx_strategy'] },
  { k: 'workforce', en: 'Emiratisation & workforce rules', ar: 'التوطين وتشريعات القوى العاملة', m: (s: any) => s.type === 'regulation', offers: ['training_quality', 'managed_cc'] },
  { k: 'growth', en: 'Expansion, launches & new licences', ar: 'التوسع والإطلاقات والتراخيص الجديدة', m: (s: any) => ['expansion', 'cross_border', 'new_licence', 'seasonal_peak', 'hiring_cs'].includes(s.type), offers: ['managed_cc', 'b2b_b2c_sales'] },
];
const inRegion = signals.filter((s) => MET.has(s.country));
const trends = THEMES.map((th) => {
  const hits = inRegion.filter(th.m);
  const deliverable = hits.filter((s) => DELIVERY_COUNTRIES.includes(s.country)).length;
  return {
    k: th.k, en: th.en, ar: th.ar, offers: th.offers, count: hits.length, deliverable,
    logos: [...new Set(hits.map((s) => s.name_en).filter(Boolean))].slice(0, 8),
    avgScore: hits.length ? Math.round(hits.reduce((a, s) => a + s.total, 0) / hits.length) : 0,
    items: hits.sort((a, b) => b.total - a.total).slice(0, 4).map((s) => ({ title: s.title, url: s.src?.url ?? '', outlet: s.src?.outlet ?? '', date: s.src?.date ?? s.first_seen_at, playId: s.play_id ? short(s.play_id) : null })),
  };
}).filter((t) => t.count > 0).sort((a, b) => b.count * b.avgScore - a.count * a.avgScore);

const [{ articles }] = await sql`SELECT count(*)::int AS articles FROM snapshots WHERE NOT is_demo`;
const [{ sources }] = await sql`SELECT count(*)::int AS sources FROM sources WHERE enabled AND last_success_at IS NOT NULL`;
const meta = { articles, sources, date: new Date().toISOString(), plays: playsOut.length, screened, logos: logosOut.length, qualifying: logosOut.filter((l) => l.qualifies).length };
const w = (f: string, d: unknown) => writeFileSync(path.join(outDir, f), JSON.stringify(d));
w('plays.json', playsOut); w('logos.json', logosOut); w('trends.json', trends); w('meta.json', meta);
console.log(`✔ exported to ${outDir}: ${playsOut.length} plays, ${logosOut.length} logos (${meta.qualifying} qualify), ${trends.length} trends, ${articles} articles from ${sources} sources`);
await sql.end();
