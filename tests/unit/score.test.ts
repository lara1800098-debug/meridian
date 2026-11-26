import { describe, expect, it } from 'vitest';
import { scoreSignal } from '@/lib/engine/score';

const W = { fit: 0.3, intent: 0.3, timing: 0.25, access: 0.15 };
const base = { signalType: 'tender' as const, sector: 'government' as const, country: 'AE', orgType: 'government', arabic: true, sourceCount: 1, bestSourceQuality: 5, ruleStrength: 1, amountUsd: 1e7, deadline: '2026-12-20', publishedAt: new Date('2026-11-20'), roles: null, access: { strongest: null, count: 0, atEvent: null }, now: new Date('2026-11-26') };

describe('scoring', () => {
  it('scores a fresh government tender highly with explanations', () => {
    const r = scoreSignal(base, W);
    expect(r.total).toBeGreaterThanOrEqual(70);
    expect(r.scores.timing.why.en).toMatch(/deadline in \d+ days/);
    expect(r.scores.fit.why.ar.length).toBeGreaterThan(5);
  });
  it('corroboration raises intent and confidence', () => {
    const weak = { ...base, amountUsd: null, deadline: null, ruleStrength: 0.6 }; const a = scoreSignal(weak, W), b = scoreSignal({ ...weak, sourceCount: 3 }, W);
    expect(b.scores.intent.score).toBeGreaterThan(a.scores.intent.score);
    expect(b.confidence).toBe('high');
  });
  it('a strong warm path raises access', () => {
    const r = scoreSignal({ ...base, access: { strongest: 'strong', count: 2, atEvent: 'GITEX' } }, W);
    expect(r.scores.access.score).toBeGreaterThanOrEqual(90);
  });
  it('timing decays and passed deadlines collapse timing', () => {
    const r = scoreSignal({ ...base, deadline: '2026-11-01', publishedAt: new Date('2026-06-01') }, W);
    expect(r.scores.timing.score).toBeLessThanOrEqual(10);
  });
  it('low-confidence items never reach leader tier', () => {
    const r = scoreSignal({ ...base, bestSourceQuality: 2, access: { strongest: 'strong', count: 3, atEvent: 'X' } }, W, { leader: 50, team: 40 });
    expect(r.confidence).toBe('low');
    expect(r.tier).toBe('team');
  });
  it('signals against deals are watchlist only', () => {
    expect(scoreSignal({ ...base, signalType: 'budget_freeze' }, W).tier).toBe('watchlist');
  });
});
