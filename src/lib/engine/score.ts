/**
 * Explainable scoring. Four sub-scores (0–100), each with a plain-language reason in EN and AR.
 * Defaults are documented in DECISIONS.md; weights and tier thresholds are Admin-editable.
 */
import { BASE_INTENT, DELIVERY_COUNTRIES, SECTOR_AR, SECTOR_FIT, type SignalType, type Sector } from '../taxonomy';

export type Why = { en: string; ar: string };
export type SubScore = { score: number; why: Why };
export type Scores = { fit: SubScore; intent: SubScore; timing: SubScore; access: SubScore };
export type Weights = { fit: number; intent: number; timing: number; access: number };

export type ScoreInput = {
  signalType: SignalType;
  sector: Sector;
  country: string;
  orgType: string;
  sizeBand?: string;
  arabic: boolean;
  sourceCount: number;
  bestSourceQuality: number; // 1..5
  ruleStrength: number; // 0..1 (or AI confidence)
  amountUsd: number | null;
  deadline: string | null;
  publishedAt: Date | null;
  roles: number | null;
  access: { strongest: 'strong' | 'medium' | 'weak' | null; count: number; atEvent: string | null };
  now?: Date;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const join = (parts: string[], sep: string) => parts.filter(Boolean).join(sep);

export function scoreSignal(i: ScoreInput, w: Weights, tiers = { leader: 75, team: 55 }) {
  const now = i.now ?? new Date();
  // ---- Fit
  let fit = SECTOR_FIT[i.sector] ?? 40;
  const fe: string[] = [`${i.sector.replace('_', ' ')} sector baseline ${fit}`], fa: string[] = [`أساس قطاع ${SECTOR_AR[i.sector] ?? i.sector}: ${fit}`];
  if (i.orgType === 'government' || i.orgType === 'semi_government') { fit += 5; fe.push('government buyer (+5)'); fa.push('جهة حكومية (+5)'); }
  if (i.orgType === 'startup') { fit -= 10; fe.push('early-stage company (−10)'); fa.push('شركة ناشئة (−10)'); }
  if (DELIVERY_COUNTRIES.includes(i.country)) { fit += 5; fe.push(`CNX delivers in ${i.country} (+5)`); fa.push(`كونسنتريكس تقدم خدماتها في ${i.country} (+5)`); }
  else { fit -= 10; fe.push(`outside CNX MET delivery footprint (−10)`); fa.push('خارج نطاق التنفيذ (−10)'); }
  if (i.arabic || i.orgType === 'government') { fit += 5; fe.push('Arabic/bilingual service need (+5)'); fa.push('حاجة لخدمة عربية/ثنائية اللغة (+5)'); }
  if (['bfsi', 'healthcare', 'telecom', 'government', 'fintech'].includes(i.sector)) { fit += 3; fe.push('regulated industry (+3)'); fa.push('قطاع منظَّم (+3)'); }
  if (i.sizeBand === 'large' || i.sizeBand === 'enterprise') { fit += 5; fe.push('large organisation (+5)'); fa.push('جهة كبيرة (+5)'); }

  // ---- Intent
  let intent = BASE_INTENT[i.signalType] * (0.7 + 0.3 * i.ruleStrength);
  const ie: string[] = [`${i.signalType.replace(/_/g, ' ')} signal (base ${BASE_INTENT[i.signalType]})`], ia: string[] = [`نوع المؤشر (أساس ${BASE_INTENT[i.signalType]})`];
  if (i.sourceCount > 1) { const b = Math.min(15, (i.sourceCount - 1) * 6); intent += b; ie.push(`corroborated by ${i.sourceCount} sources (+${b})`); ia.push(`مؤكد من ${i.sourceCount} مصادر (+${b})`); }
  if (i.amountUsd) { intent += 5; ie.push('specific value stated (+5)'); ia.push('قيمة محددة مذكورة (+5)'); }
  if (i.deadline) { intent += 5; ie.push('specific date stated (+5)'); ia.push('تاريخ محدد مذكور (+5)'); }
  if (i.roles && i.signalType === 'hiring_cs') { const b = Math.min(15, Math.round(i.roles / 5)); intent += b; ie.push(`${i.roles} CS roles (+${b})`); ia.push(`${i.roles} وظيفة خدمة عملاء (+${b})`); }
  if (i.ruleStrength < 0.5) { ie.push('weak/vague wording'); ia.push('صياغة عامة أو ضعيفة'); }

  // ---- Timing
  let timing: number; const te: string[] = [], ta: string[] = [];
  const ageDays = i.publishedAt ? Math.max(0, (now.getTime() - i.publishedAt.getTime()) / 86400000) : 7;
  timing = 100 * Math.exp(-ageDays / 45);
  te.push(i.publishedAt ? `published ${Math.round(ageDays)} days ago` : 'publish date unknown (assumed 7 days)');
  ta.push(i.publishedAt ? `نُشر قبل ${Math.round(ageDays)} يوماً` : 'تاريخ النشر غير معروف');
  if (i.deadline) {
    const dd = (new Date(i.deadline).getTime() - now.getTime()) / 86400000;
    if (dd < 0) { timing = Math.min(timing, 10); te.push('deadline passed'); ta.push('انقضى الموعد'); }
    else if (dd <= 60) { timing = Math.max(timing, 92 - dd / 3); te.push(`deadline in ${Math.round(dd)} days — act now`); ta.push(`الموعد خلال ${Math.round(dd)} يوماً — تحرك الآن`); }
    else { timing = Math.max(timing, 70); te.push(`deadline in ${Math.round(dd)} days — time to position`); ta.push(`الموعد خلال ${Math.round(dd)} يوماً — وقت للتموضع`); }
  }
  if (i.signalType === 'leader_appointed' && ageDays < 90) { timing = Math.max(timing, 85 - ageDays / 3); te.push('new leaders buy in their first 90 days'); ta.push('القادة الجدد يتخذون قرارات الشراء في أول 90 يوماً'); }
  if (i.signalType === 'funding' && ageDays < 60) { timing = Math.max(timing, 80); te.push('fresh funding — scaling support soon'); ta.push('تمويل جديد — توسع قريب في الدعم'); }

  // ---- Access
  let access = 20; const ae: string[] = [], aa: string[] = [];
  if (i.access.strongest === 'strong') { access += 55; ae.push('strong warm relationship recorded'); aa.push('علاقة قوية مسجلة'); }
  else if (i.access.strongest === 'medium') { access += 35; ae.push('medium relationship recorded'); aa.push('علاقة متوسطة مسجلة'); }
  else if (i.access.strongest === 'weak') { access += 15; ae.push('weak relationship recorded'); aa.push('علاقة ضعيفة مسجلة'); }
  else { ae.push('no warm path recorded yet'); aa.push('لا يوجد طريق دافئ مسجل بعد'); }
  if (i.access.count > 1) { access += Math.min(10, (i.access.count - 1) * 5); ae.push(`${i.access.count} people know them`); aa.push(`${i.access.count} أشخاص يعرفونهم`); }
  if (i.access.atEvent) { access += 15; ae.push(`likely at ${i.access.atEvent}`); aa.push(`حضور مرجح في ${i.access.atEvent}`); }

  const scores: Scores = {
    fit: { score: clamp(fit), why: { en: join(fe, '; '), ar: join(fa, '؛ ') } },
    intent: { score: clamp(intent), why: { en: join(ie, '; '), ar: join(ia, '؛ ') } },
    timing: { score: clamp(timing), why: { en: join(te, '; '), ar: join(ta, '؛ ') } },
    access: { score: clamp(access), why: { en: join(ae, '; '), ar: join(aa, '؛ ') } },
  };
  const wsum = w.fit + w.intent + w.timing + w.access || 1;
  const total = clamp((scores.fit.score * w.fit + scores.intent.score * w.intent + scores.timing.score * w.timing + scores.access.score * w.access) / wsum);

  // ---- Confidence (source quality × corroboration × extraction strength)
  let confidence: 'high' | 'medium' | 'low' =
    (i.bestSourceQuality >= 4 && i.sourceCount >= 2) || i.sourceCount >= 3 ? 'high' : i.bestSourceQuality >= 4 || i.sourceCount >= 2 ? 'medium' : 'low';
  if (i.ruleStrength < 0.5 && confidence === 'high') confidence = 'medium';

  let tier: 'leader' | 'team' | 'watchlist' = total >= tiers.leader ? 'leader' : total >= tiers.team ? 'team' : 'watchlist';
  if (tier === 'leader' && confidence === 'low') tier = 'team'; // executives only see corroborated or high-quality items
  if (BASE_INTENT[i.signalType] === 0) tier = 'watchlist';
  return { scores, total, confidence, tier };
}
