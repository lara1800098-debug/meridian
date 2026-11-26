import 'server-only';
import { sql } from '@/db';
import type { SessionUser } from '../rbac';
import { seesEverything } from '../rbac';
import { realityCheck, type Health, type Stage } from '../engine/health';
import { getSettings } from '../settings';
import { toUsd, type Fx, quarterRange } from '../format';
import { commit, concentration, coverage, realistic, weighted, type FDeal } from '../engine/forecast';

/** Row-level filtering enforced server-side for every deal query. */
export function dealScope(u: SessionUser) {
  if (seesEverything(u)) return sql`TRUE`;
  if (u.role === 'director') {
    return sql`(d.owner_id = ${u.id} OR d.owner_id IN (SELECT id FROM users WHERE manager_id = ${u.id})
      OR (d.country = ANY(${u.countries}) AND (cardinality(${u.sectors}::text[]) = 0 OR d.sector = ANY(${u.sectors}))))`;
  }
  return sql`(d.owner_id = ${u.id} OR d.created_by = ${u.id})`;
}
export function playScope(u: SessionUser) {
  if (seesEverything(u)) return sql`TRUE`;
  return sql`(p.owner_id = ${u.id} OR (s.country = ANY(${u.countries}) AND (cardinality(${u.sectors}::text[]) = 0 OR s.sector = ANY(${u.sectors}))))`;
}

export async function canSeeDeal(u: SessionUser, dealId: string) {
  const [r] = await sql`SELECT 1 FROM deals d WHERE d.id = ${dealId} AND ${dealScope(u)}`;
  return !!r;
}

export type DealRow = Record<string, any> & { health: Health; tcv_usd: number; annual_usd: number; probability: number; stageObj: Stage };

export async function stages(): Promise<Stage[]> { return (await sql`SELECT * FROM stages ORDER BY sort`) as unknown as Stage[]; }

export async function loadDeals(u: SessionUser, fx: Fx, f: { status?: string; country?: string; sector?: string; track?: string; owner?: string; ids?: string[] } = {}): Promise<DealRow[]> {
  const s = await getSettings();
  const st = await stages();
  const rows = await sql`
    SELECT d.*, o.name_en AS org_name, o.name_ar AS org_name_ar, u.name AS owner_name
    FROM deals d LEFT JOIN organisations o ON o.id = d.org_id LEFT JOIN users u ON u.id = d.owner_id
    WHERE ${dealScope(u)}
      ${f.status ? sql`AND d.status = ${f.status}` : sql``}
      ${f.country && f.country !== 'ALL' ? sql`AND d.country = ${f.country}` : sql``}
      ${f.sector && f.sector !== 'ALL' ? sql`AND d.sector = ${f.sector}` : sql``}
      ${f.track && f.track !== 'ALL' ? sql`AND d.track = ${f.track}` : sql``}
      ${f.owner ? sql`AND d.owner_id = ${f.owner}` : sql``}
      ${f.ids ? sql`AND d.id = ANY(${f.ids})` : sql``}
    ORDER BY d.tcv DESC`;
  const ids = rows.map((r) => r.id);
  const against = ids.length ? await sql`
    SELECT ds.deal_id, sg.id, sg.title, sg.signal_type, (SELECT snapshot_id FROM signal_sources WHERE signal_id = sg.id LIMIT 1) AS snapshot_id
    FROM deal_signals ds JOIN signals sg ON sg.id = ds.signal_id WHERE ds.deal_id = ANY(${ids}) AND sg.track = 'against'` : [];
  return rows.map((d) => {
    const stage = st.find((x) => x.key === d.stage)!;
    const health = realityCheck(d as any, stage, {
      pushLimit: s.closeDatePushLimit, lowPeriods: s.lowActivityPeriods,
      against: against.filter((a) => a.deal_id === d.id).map((a) => ({ id: a.id, title: a.title, signal_type: a.signal_type, snapshotId: a.snapshot_id })),
    });
    return { ...d, health, stageObj: stage, probability: d.probability_override ?? stage.probability, tcv_usd: toUsd(Number(d.tcv), d.currency, fx), annual_usd: toUsd(Number(d.annual_value), d.currency, fx) } as DealRow;
  });
}

export async function history(): Promise<{ stageWinRate: Record<string, number>; slippageRate: number | null; n: number }> {
  const closed = await sql`SELECT id, status FROM deals WHERE status IN ('won','lost','no_decision')`;
  const n = closed.length;
  if (n < 10) return { stageWinRate: {}, slippageRate: null, n };
  const reached = await sql`SELECT DISTINCT deal_id, new_value AS stage FROM deal_history WHERE field = 'stage'`;
  const won = new Set(closed.filter((c) => c.status === 'won').map((c) => c.id));
  const closedIds = new Set(closed.map((c) => c.id));
  const byStage: Record<string, { w: number; t: number }> = {};
  for (const r of reached) { if (!closedIds.has(r.deal_id)) continue; byStage[r.stage] ??= { w: 0, t: 0 }; byStage[r.stage].t++; if (won.has(r.deal_id)) byStage[r.stage].w++; }
  const stageWinRate = Object.fromEntries(Object.entries(byStage).filter(([, v]) => v.t >= 3).map(([k, v]) => [k, v.w / v.t]));
  const [sl] = await sql`SELECT avg(CASE WHEN close_date_pushes > 0 THEN 1 ELSE 0 END)::float AS r FROM deals WHERE status IN ('won','lost','no_decision')`;
  return { stageWinRate, slippageRate: sl?.r ?? null, n };
}

export async function forecastFor(u: SessionUser, fx: Fx, quarter: string, f: { country?: string; sector?: string; track?: string } = {}) {
  const s = await getSettings();
  const { start, end } = quarterRange(quarter);
  const all = await loadDeals(u, fx, f);
  const inQ = (d: DealRow) => d.expected_close && new Date(d.expected_close) >= start && new Date(d.expected_close) <= end;
  const open = all.filter((d) => d.status === 'open' && inQ(d));
  const wonQ = all.filter((d) => d.status === 'won' && d.closed_at && new Date(d.closed_at) >= start && new Date(d.closed_at) <= end);
  const wonUsd = wonQ.reduce((a, d) => a + toUsd(Number(d.final_value ?? d.tcv), d.currency, fx), 0);
  const fd: FDeal[] = open.map((d) => ({ id: d.id, title: d.title, tcv_usd: d.tcv_usd, probability: d.probability, health: d.health.status, owner_commit: d.owner_commit, expected_close: d.expected_close, status: d.status, stage: d.stage, source: d.source }));
  const h = await history();
  const real = realistic(fd, s.realistic, h);
  const trows = await sql`SELECT country, sector, track, amount_usd::float AS a FROM targets WHERE quarter = ${quarter}`;
  const target = targetFor(trows as any, f);
  const pipe = fd.reduce((a, d) => a + d.tcv_usd, 0);
  return {
    quarter, open, all, won: wonUsd, pipeline: pipe, weighted: weighted(fd) + wonUsd, commit: commit(fd) + wonUsd, realistic: real.total + wonUsd, realMethod: real,
    target, coverage: coverage(pipe, target, wonUsd), concentration: concentration(fd), coverageThreshold: s.coverageThreshold,
  };
}

/** Target for a filter: exact matches; when a dimension is ALL, prefer the explicit 'ALL' row, else sum the specific rows. */
export function targetFor(rows: { country: string; sector: string; track: string; a: number }[], f: { country?: string; sector?: string; track?: string }) {
  let r = rows;
  for (const dim of ['country', 'sector', 'track'] as const) {
    const want = f[dim] ?? 'ALL';
    if (want === 'ALL') { const all = r.filter((x) => x[dim] === 'ALL'); r = all.length ? all : r; }
    else { const ex = r.filter((x) => x[dim] === want); r = ex.length ? ex : []; }
  }
  return r.reduce((a, x) => a + x.a, 0);
}
