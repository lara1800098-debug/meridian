/** Reality Check engine: deterministic rules → Healthy / Watch / At risk with exact reasons. */
export type Stage = { key: string; name_en: string; name_ar: string; sort: number; probability: number; entry_criteria: string[]; norm_days: number; stale_days: number; is_closed: boolean };
export type DealLike = {
  stage: string; status: string; tcv: number; economic_buyer: string | null; champion: string | null; compelling_event: string | null; decision_date: string | Date | null;
  scope_recorded: boolean; next_step: string | null; next_step_date: string | Date | null; expected_close: string | Date | null; close_date_pushes: number;
  stage_entered_at: string | Date; last_activity_at: string | Date; value_change_unexplained: boolean;
};
export type AgainstSignal = { id: string; title: string; signal_type: string; snapshotId?: string };
export type Reason = { code: string; severity: 1 | 2 | 3; params: Record<string, string | number>; signalId?: string };
export type Health = { status: 'healthy' | 'watch' | 'at_risk'; points: number; reasons: Reason[] };

const days = (a: string | Date, now: Date) => Math.floor((now.getTime() - new Date(a).getTime()) / 86400000);

export function criteriaMissing(d: DealLike, criteria: string[]) {
  const has: Record<string, boolean> = {
    economic_buyer: !!d.economic_buyer?.trim(), compelling_event: !!d.compelling_event?.trim(), value: Number(d.tcv) > 0,
    champion: !!d.champion?.trim(), scope: d.scope_recorded, decision_date: !!d.decision_date, next_step: !!d.next_step?.trim(),
  };
  return criteria.filter((c) => !has[c]);
}

export function realityCheck(d: DealLike, stage: Stage, opts: { pushLimit: number; lowPeriods: { name: string; from: string; to: string }[]; against: AgainstSignal[]; now?: Date }): Health {
  const now = opts.now ?? new Date();
  const r: Reason[] = [];
  if (d.status !== 'open' || stage.is_closed) return { status: 'healthy', points: 0, reasons: [] };
  const idle = days(d.last_activity_at, now);
  if (idle >= stage.stale_days) r.push({ code: 'noActivity', severity: idle >= stage.stale_days * 2 ? 3 : 2, params: { d: idle } });
  if (!d.next_step?.trim()) r.push({ code: 'noNextStep', severity: 2, params: {} });
  else if (d.next_step_date && new Date(d.next_step_date) < new Date(now.toDateString())) r.push({ code: 'nextStepPast', severity: 2, params: {} });
  if (d.close_date_pushes > opts.pushLimit) r.push({ code: 'pushed', severity: d.close_date_pushes > opts.pushLimit + 1 ? 3 : 2, params: { n: d.close_date_pushes } });
  const inStage = days(d.stage_entered_at, now);
  if (stage.norm_days > 0 && inStage > stage.norm_days) r.push({ code: 'stuck', severity: inStage > stage.norm_days * 2 ? 3 : 1, params: { d: inStage, n: stage.norm_days, stage: stage.key } });
  const miss = criteriaMissing(d, stage.entry_criteria);
  if (miss.length) r.push({ code: 'criteria', severity: miss.length >= 3 ? 3 : 2, params: { list: miss.join(',') } });
  if (stage.sort >= 2) {
    if (!d.economic_buyer?.trim() && !miss.includes('economic_buyer')) r.push({ code: 'missingEB', severity: 1, params: {} });
    if (!d.compelling_event?.trim() && !miss.includes('compelling_event')) r.push({ code: 'missingEvent', severity: 1, params: {} });
  }
  if (stage.sort >= 4 && !d.champion?.trim() && !miss.includes('champion')) r.push({ code: 'missingChampion', severity: 1, params: {} });
  if (stage.sort >= 4 && !d.decision_date && !miss.includes('decision_date')) r.push({ code: 'missingDecision', severity: 1, params: {} });
  if (d.value_change_unexplained) r.push({ code: 'valueJump', severity: 2, params: {} });
  if (d.expected_close && new Date(d.expected_close) < new Date(now.toDateString())) r.push({ code: 'closePast', severity: 3, params: {} });
  for (const s of opts.against) r.push({ code: 'against', severity: 3, params: { t: s.title }, signalId: s.id });
  if (d.expected_close) {
    const c = new Date(d.expected_close);
    const p = opts.lowPeriods.find((p) => c >= new Date(p.from) && c <= new Date(p.to));
    if (p) r.push({ code: 'lowPeriod', severity: 1, params: { p: p.name } });
  }
  const points = r.reduce((a, x) => a + (x.code === 'lowPeriod' ? 0 : x.severity), 0);
  const hasSev3 = r.some((x) => x.severity === 3);
  const status = hasSev3 || points >= 6 ? 'at_risk' : points >= 2 ? 'watch' : 'healthy';
  return { status, points, reasons: r.sort((a, b) => b.severity - a.severity) };
}
