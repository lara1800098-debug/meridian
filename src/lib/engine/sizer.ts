/** Quick Sizer: Erlang-C staffing estimate with shrinkage → FTE range → deal value via Admin rate cards. Indicative only. */

export function erlangC(agents: number, traffic: number) {
  if (agents <= traffic) return 1;
  // Stable iterative Erlang-B then convert to C
  let b = 1;
  for (let k = 1; k <= agents; k++) b = (traffic * b) / (k + traffic * b);
  return b / (1 - (traffic / agents) * (1 - b));
}

/** Minimum agents to hit service level: P(wait ≤ t) ≥ target. */
export function agentsForSL(callsPerHour: number, ahtSec: number, slTarget: number, slSec: number) {
  const traffic = (callsPerHour * ahtSec) / 3600;
  if (traffic <= 0) return 0;
  let n = Math.max(1, Math.ceil(traffic));
  for (; n < traffic * 3 + 50; n++) {
    const pw = erlangC(n, traffic);
    const sl = 1 - pw * Math.exp(-(n - traffic) * (slSec / ahtSec));
    if (sl >= slTarget) return n;
  }
  return n;
}

export type SizerInput = {
  monthlyContacts: number; mix: { voice: number; chat: number; email: number }; ahtSec: number; hoursPerDay: number; daysPerWeek: number;
  slTarget: number; slSec: number; shrinkage: number; chatConcurrency?: number; languages: number;
};

export function size(i: SizerInput) {
  const daysPerMonth = (i.daysPerWeek * 52) / 12;
  const openHours = daysPerMonth * i.hoursPerDay;
  const peakFactor = 1.3; // busy-hour vs average
  const voicePerHour = (i.monthlyContacts * i.mix.voice) / openHours * peakFactor;
  const chatPerHour = (i.monthlyContacts * i.mix.chat) / openHours * peakFactor;
  const voiceAgents = agentsForSL(voicePerHour, i.ahtSec, i.slTarget, i.slSec);
  const chatAgents = Math.ceil(agentsForSL(chatPerHour, i.ahtSec * 1.4, i.slTarget, i.slSec * 2) / (i.chatConcurrency ?? 2));
  const emailHours = (i.monthlyContacts * i.mix.email * (i.ahtSec * 1.5)) / 3600;
  const emailAgents = Math.ceil(emailHours / (openHours * 0.85));
  const onPhone = voiceAgents + chatAgents + emailAgents;
  // Coverage: open hours vs a ~40h FTE week
  const coverageFactor = (i.hoursPerDay * i.daysPerWeek) / 40;
  const langFactor = 1 + Math.max(0, i.languages - 1) * 0.08; // skill-split inefficiency
  const base = (onPhone * coverageFactor * langFactor) / (1 - i.shrinkage);
  // Average-hour staffing is lower than busy-hour; give a range
  const low = Math.max(1, Math.round(base * 0.8)), high = Math.max(1, Math.round(base * 1.1));
  return {
    fte: [low, high] as [number, number],
    seats: [Math.max(1, Math.round(low / Math.max(1, coverageFactor) * 1.05)), Math.max(1, Math.round(high / Math.max(1, coverageFactor) * 1.1))] as [number, number],
    detail: { voiceAgents, chatAgents, emailAgents, voicePerHour: Math.round(voicePerHour), coverageFactor: +coverageFactor.toFixed(2), langFactor: +langFactor.toFixed(2) },
  };
}

/** SMB proxy: no volume data — estimate contacts from customers/headcount/hiring. */
export function smbProxy(p: { headcount?: number; customers?: number; csRoles?: number }) {
  const fromCustomers = p.customers ? p.customers * 0.08 : 0; // ~8% contact rate / month
  const fromHeadcount = p.headcount ? p.headcount * 25 : 0;
  const fromRoles = p.csRoles ? p.csRoles * 1100 : 0; // ~1,100 contacts per CS FTE / month
  const vals = [fromCustomers, fromHeadcount, fromRoles].filter((v) => v > 0);
  const est = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return {
    monthlyContacts: Math.round(est),
    assumptions: [
      p.customers ? `${p.customers} customers × 8% monthly contact rate` : null,
      p.headcount ? `${p.headcount} staff × 25 contacts/staff/month` : null,
      p.csRoles ? `${p.csRoles} open CS roles × 1,100 contacts per FTE/month` : null,
    ].filter(Boolean) as string[],
  };
}

export function value(seats: [number, number], rate: { min: number; max: number }) {
  return { annualLowUsd: seats[0] * rate.min * 12, annualHighUsd: seats[1] * rate.max * 12 };
}
