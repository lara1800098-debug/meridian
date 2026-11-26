import { describe, expect, it } from 'vitest';
import { realityCheck, criteriaMissing } from '@/lib/engine/health';
import { concentration, coverage, realistic, weighted } from '@/lib/engine/forecast';
import { targetFor } from '@/lib/data/deals';

const stage = { key: 'proposal', name_en: 'Proposal', name_ar: '', sort: 5, probability: 55, entry_criteria: ['economic_buyer', 'compelling_event', 'value', 'champion', 'scope', 'decision_date'], norm_days: 45, stale_days: 21, is_closed: false };
const now = new Date('2026-11-26');
const good = { stage: 'proposal', status: 'open', tcv: 1e6, economic_buyer: 'CFO', champion: 'Head of CX', compelling_event: 'Go-live Q2', decision_date: '2027-01-10', scope_recorded: true, next_step: 'Orals', next_step_date: '2026-12-02', expected_close: '2027-01-15', close_date_pushes: 0, stage_entered_at: '2026-11-10', last_activity_at: '2026-11-24', value_change_unexplained: false };
const opts = { pushLimit: 2, lowPeriods: [{ name: 'Ramadan', from: '2027-02-08', to: '2027-03-09' }], against: [], now };

describe('reality check', () => {
  it('healthy deal has no reasons', () => {
    const h = realityCheck(good, stage, opts);
    expect(h.status).toBe('healthy');
    expect(h.reasons).toHaveLength(0);
  });
  it('stale, no next step, missing criteria → at risk with exact reasons', () => {
    const h = realityCheck({ ...good, last_activity_at: '2026-10-01', next_step: null, champion: null, scope_recorded: false }, stage, opts);
    expect(h.status).toBe('at_risk');
    const codes = h.reasons.map((r) => r.code);
    expect(codes).toContain('noActivity');
    expect(codes).toContain('noNextStep');
    expect(codes).toContain('criteria');
  });
  it('external signal against the deal is a severity-3 reason', () => {
    const h = realityCheck(good, stage, { ...opts, against: [{ id: 's1', title: 'Budget freeze', signal_type: 'budget_freeze' }] });
    expect(h.status).toBe('at_risk');
    expect(h.reasons[0].signalId).toBe('s1');
  });
  it('close date in Ramadan is informational only', () => {
    const h = realityCheck({ ...good, expected_close: '2027-02-20' }, stage, opts);
    expect(h.reasons.map((r) => r.code)).toEqual(['lowPeriod']);
    expect(h.status).toBe('healthy');
  });
  it('lists missing criteria', () => {
    expect(criteriaMissing({ ...good, economic_buyer: '', tcv: 0 }, ['economic_buyer', 'value'])).toEqual(['economic_buyer', 'value']);
  });
});

describe('forecast maths', () => {
  const deals = [
    { id: 'a', title: 'A', tcv_usd: 1_000_000, probability: 50, health: 'healthy' as const, owner_commit: true, expected_close: null, status: 'open', stage: 'proposal', source: 'meridian' },
    { id: 'b', title: 'B', tcv_usd: 500_000, probability: 40, health: 'at_risk' as const, owner_commit: false, expected_close: null, status: 'open', stage: 'solutioning', source: 'other' },
    { id: 'c', title: 'C', tcv_usd: 100_000, probability: 10, health: 'watch' as const, owner_commit: false, expected_close: null, status: 'open', stage: 'qualified', source: 'other' },
  ];
  it('weighted = Σ value × p', () => expect(weighted(deals)).toBe(500_000 + 200_000 + 10_000));
  it('realistic applies health factors', () => {
    const r = realistic(deals, { watchFactor: 0.8, atRiskFactor: 0.5 });
    expect(r.total).toBeCloseTo(500_000 + 100_000 + 8_000);
    expect(r.method).toBe('default');
  });
  it('realistic uses history once ≥10 closed deals', () => {
    const r = realistic(deals, { watchFactor: 1, atRiskFactor: 1 }, { stageWinRate: { proposal: 0.3 }, slippageRate: 0.2, n: 12 });
    expect(r.method).toBe('historical');
    expect(r.lines[0].p).toBeCloseTo(30);
  });
  it('coverage vs remaining target', () => {
    expect(coverage(3_000_000, 2_000_000, 1_000_000)).toEqual({ remaining: 1_000_000, ratio: 3 });
  });
  it('concentration share of top 3', () => {
    expect(concentration(deals, 1).share).toBeCloseTo(1_000_000 / 1_600_000);
  });
  it('target lookup prefers explicit ALL rows', () => {
    const rows = [{ country: 'ALL', sector: 'ALL', track: 'ALL', a: 10 }, { country: 'AE', sector: 'ALL', track: 'ALL', a: 7 }];
    expect(targetFor(rows, {})).toBe(10);
    expect(targetFor(rows, { country: 'AE' })).toBe(7);
  });
});
