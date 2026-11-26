import 'server-only';
import { sql } from '@/db';
import type { SessionUser } from '../rbac';
import { forecastFor, loadDeals, playScope } from './deals';
import { quarterOf, type Fx } from '../format';

export type Filters = { country?: string; sector?: string; track?: string; quarter?: string };

export async function topPlays(u: SessionUser, f: Filters & { tier?: string[]; limit?: number; days?: number } = {}) {
  return sql`
    SELECT p.*, s.title AS signal_title, s.title_en, s.signal_type, s.country, s.sector, s.track, s.lang, s.is_demo, o.name_en AS org_name, o.name_ar AS org_name_ar,
      (SELECT count(*) FROM signal_sources WHERE signal_id = s.id)::int AS n_sources,
      (SELECT min(sn.published_at) FROM signal_sources ss JOIN snapshots sn ON sn.id = ss.snapshot_id WHERE ss.signal_id = s.id) AS published_at,
      ow.name AS owner_name
    FROM plays p JOIN signals s ON s.id = p.signal_id LEFT JOIN organisations o ON o.id = p.org_id LEFT JOIN users ow ON ow.id = p.owner_id
    WHERE ${playScope(u)} AND p.status = 'new'
      ${f.tier ? sql`AND p.tier = ANY(${f.tier})` : sql``}
      ${f.country && f.country !== 'ALL' ? sql`AND s.country = ${f.country}` : sql``}
      ${f.sector && f.sector !== 'ALL' ? sql`AND s.sector = ${f.sector}` : sql``}
      ${f.track && f.track !== 'ALL' ? sql`AND s.track = ${f.track}` : sql``}
      ${f.days ? sql`AND p.created_at > now() - make_interval(days => ${f.days})` : sql``}
    ORDER BY p.total DESC, p.created_at DESC LIMIT ${f.limit ?? 10}`;
}

export async function marketMoves(u: SessionUser, days = 7, limit = 6) {
  return sql`
    SELECT s.id, s.title, s.title_en, s.signal_type, s.track, s.first_seen_at, s.confidence, s.is_demo,
      (SELECT snapshot_id FROM signal_sources WHERE signal_id = s.id LIMIT 1) AS snapshot_id
    FROM signals s WHERE (s.track = 'competitor' OR s.signal_type IN ('regulation', 'service_ratings', 'tender_award')) AND s.first_seen_at > now() - make_interval(days => ${days})
    ${u.role === 'admin' || u.role === 'executive' ? sql`` : sql`AND s.country = ANY(${u.countries})`}
    ORDER BY s.total DESC LIMIT ${limit}`;
}

/** Warm-path suggestions for leaders: strongest relationships into orgs with open leader/team plays or at-risk deals. */
export async function whoCallsWhom(u: SessionUser, limit = 5) {
  return sql`
    SELECT DISTINCT ON (r.org_id) r.person_name, r.person_title, r.strength, r.context, uu.name AS knower, o.name_en AS org_name, o.id AS org_id, p.id AS play_id, p.headline, p.total
    FROM relationships r JOIN users uu ON uu.id = r.user_id JOIN organisations o ON o.id = r.org_id
    JOIN plays p ON p.org_id = r.org_id AND p.status = 'new' JOIN signals s ON s.id = p.signal_id
    WHERE ${playScope(u)}
    ORDER BY r.org_id, CASE r.strength WHEN 'strong' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, p.total DESC LIMIT ${limit}`;
}

export async function cockpitData(u: SessionUser, fx: Fx, f: Filters) {
  const quarter = f.quarter ?? quarterOf();
  const fc = await forecastFor(u, fx, quarter, f);
  const openAll = (await loadDeals(u, fx, { status: 'open', country: f.country, sector: f.sector, track: f.track }));
  const pipelineAll = openAll.reduce((a, d) => a + d.tcv_usd, 0);
  const weightedAll = openAll.reduce((a, d) => a + d.tcv_usd * d.probability / 100, 0);
  const meridian = openAll.filter((d) => d.source === 'meridian').reduce((a, d) => a + d.tcv_usd, 0);
  const atRisk = openAll.filter((d) => d.health.status === 'at_risk');
  const [{ n: newLeader }] = await sql`SELECT count(*)::int AS n FROM plays p JOIN signals s ON s.id = p.signal_id WHERE ${playScope(u)} AND p.tier = 'leader' AND p.status = 'new' AND p.created_at > now() - interval '7 days'`;
  const byStage = new Map<string, number>(), byCountry = new Map<string, number>(), bySector = new Map<string, number>(), byTrack = new Map<string, number>();
  for (const d of openAll) {
    byStage.set(d.stage, (byStage.get(d.stage) ?? 0) + d.tcv_usd);
    byCountry.set(d.country, (byCountry.get(d.country) ?? 0) + d.tcv_usd);
    bySector.set(d.sector, (bySector.get(d.sector) ?? 0) + d.tcv_usd);
    byTrack.set(d.track, (byTrack.get(d.track) ?? 0) + d.tcv_usd);
  }
  // Forecast trend: reconstruct weekly snapshots this quarter from deal_history isn't exact; we store realistic in briefs weekly.
  const trend = await sql`SELECT week_start, content->'forecast' AS f FROM briefs WHERE user_id = ${u.id} ORDER BY week_start DESC LIMIT 13`;
  return {
    quarter, fc, pipelineAll, weightedAll, meridian, atRisk: atRisk.sort((a, b) => b.health.points - a.health.points || b.tcv_usd - a.tcv_usd),
    atRiskValue: atRisk.reduce((a, d) => a + d.tcv_usd, 0), newLeader,
    byStage, byCountry, bySector, byTrack, trend: trend.reverse(),
  };
}
