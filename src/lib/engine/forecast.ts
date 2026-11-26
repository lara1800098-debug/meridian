/** Forecast maths — transparent and unit-tested. All values in USD. */
export type FDeal = { id: string; title: string; tcv_usd: number; probability: number; health: 'healthy' | 'watch' | 'at_risk'; owner_commit: boolean; expected_close: string | null; status: string; stage: string; source: string };
export type History = { stageWinRate: Record<string, number> | null; slippageRate: number | null; n: number };

export function weighted(deals: FDeal[]) { return deals.reduce((a, d) => a + d.tcv_usd * d.probability / 100, 0); }
export function commit(deals: FDeal[]) { return deals.filter((d) => d.owner_commit).reduce((a, d) => a + d.tcv_usd, 0); }

/**
 * Meridian realistic forecast:
 *   Σ value × p × healthFactor × (1 − slippage)
 * where p = historical win rate from this stage once ≥ 10 closed deals exist (else stage probability),
 * healthFactor = 1 (healthy) / watchFactor / atRiskFactor, slippage = historical share of deals whose close date moved out of quarter.
 */
export function realistic(deals: FDeal[], f: { watchFactor: number; atRiskFactor: number }, h?: History) {
  const useHist = !!h && h.n >= 10;
  const slip = useHist && h!.slippageRate != null ? h!.slippageRate : 0;
  let total = 0;
  const lines = deals.map((d) => {
    const p = useHist && h!.stageWinRate?.[d.stage] != null ? h!.stageWinRate[d.stage] * 100 : d.probability;
    const hf = d.health === 'at_risk' ? f.atRiskFactor : d.health === 'watch' ? f.watchFactor : 1;
    const v = d.tcv_usd * (p / 100) * hf * (1 - slip);
    total += v;
    return { id: d.id, v, p, hf };
  });
  return { total, lines, method: useHist ? 'historical' : 'default', slippage: slip };
}

export function coverage(openPipelineUsd: number, targetUsd: number, wonUsd: number) {
  const remaining = Math.max(0, targetUsd - wonUsd);
  return { remaining, ratio: remaining > 0 ? openPipelineUsd / remaining : null };
}

export function concentration(deals: FDeal[], topN = 3) {
  const sorted = [...deals].sort((a, b) => b.tcv_usd - a.tcv_usd);
  const total = sorted.reduce((a, d) => a + d.tcv_usd, 0);
  const top = sorted.slice(0, topN);
  const share = total ? top.reduce((a, d) => a + d.tcv_usd, 0) / total : 0;
  return { share, n: top.length, deals: top };
}

/** Stage-to-stage conversion from history rows (deal_id, field='stage', new_value) — share of deals that reached stage i+1 given they reached i. */
export function funnel(reached: Record<string, Set<string>>, order: string[]) {
  return order.slice(0, -1).map((s, i) => {
    const from = reached[s]?.size ?? 0, to = reached[order[i + 1]]?.size ?? 0;
    return { from: s, to: order[i + 1], n: from, rate: from ? Math.min(1, to / from) : null };
  });
}
