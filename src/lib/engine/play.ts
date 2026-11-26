/**
 * Turns a scored signal into a Play: headline, why-now (each bullet cites a snapshot), offers, value range,
 * risks, and bilingual outreach drafts built ONLY from facts in the signal (no invented names, numbers or quotes).
 */
import { BUYER_ROLES, type SignalType } from '../taxonomy';
import type { Scores } from './score';

export type Offer = { key: string; name_en: string; name_ar: string; pitch_en: string; pitch_ar: string; ideal_signals: string[]; ideal_sectors: string[]; ideal_types: string[]; proof_points: { text: string; url: string }[] };
export type RateCard = { country: string; service_type: string; min_usd_per_seat_month: number; max_usd_per_seat_month: number };
export type PlaySource = { snapshotId: string; title: string; url: string; publishedAt: string | null; outlet: string };

export type PlayInput = {
  signalType: SignalType; track: string; sector: string; country: string; orgType: string; sizeBand: string;
  orgName: string | null; orgNameAr: string | null; title: string; titleEn: string | null; amountText: string | null; amountUsd: number | null; deadline: string | null; roles: number | null;
  sources: PlaySource[]; scores: Scores; confidence: string; competitors: string[];
};

export function matchOffers(i: Pick<PlayInput, 'signalType' | 'sector' | 'orgType'>, offers: Offer[], n = 2) {
  return offers
    .map((o) => ({ o, s: (o.ideal_signals.includes(i.signalType) ? 3 : 0) + (o.ideal_sectors.length === 0 || o.ideal_sectors.includes(i.sector) ? 1 : 0) + (o.ideal_types.includes(i.orgType) ? 1 : 0) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s || (b.o.proof_points.length - a.o.proof_points.length))
    .slice(0, n)
    .map((x) => x.o);
}

const SEATS: Record<string, [number, number]> = { smb: [5, 20], startup: [5, 25], private: [20, 80], semi_government: [40, 160], government: [50, 250] };
const SIZE_MULT: Record<string, number> = { small: 0.5, medium: 1, large: 1.8, enterprise: 2.5, unknown: 1 };

export function estimateValue(i: Pick<PlayInput, 'orgType' | 'sizeBand' | 'country' | 'roles'>, rates: RateCard[]) {
  let [lo, hi] = SEATS[i.orgType] ?? [20, 80];
  const m = SIZE_MULT[i.sizeBand] ?? 1;
  lo = Math.round(lo * m); hi = Math.round(hi * m);
  if (i.roles) { lo = Math.max(lo, Math.round(i.roles * 0.5)); hi = Math.max(hi, Math.round(i.roles * 1.5)); }
  const rc = rates.find((r) => r.country === i.country && r.service_type === 'omnichannel') ?? rates.find((r) => r.country === 'AE' && r.service_type === 'omnichannel') ?? { min_usd_per_seat_month: 2400, max_usd_per_seat_month: 3500 } as RateCard;
  const low = lo * Number(rc.min_usd_per_seat_month) * 12, high = hi * Number(rc.max_usd_per_seat_month) * 12;
  const band = high < 1e6 ? 'S' : high < 5e6 ? 'M' : high < 15e6 ? 'L' : 'XL';
  return { lowUsd: Math.round(low / 1000) * 1000, highUsd: Math.round(high / 1000) * 1000, seats: [lo, hi] as [number, number], band, assumptions: `${lo}–${hi} seats × omnichannel rate card (${i.country}) × 12 months` };
}

const HEAD: Partial<Record<SignalType, [string, string]>> = {
  tender: ['{org} has a live tender — qualify and decide Go/No-Go this week', '{org} طرحت مناقصة — قيّم وقرر المضي أو عدمه هذا الأسبوع'],
  tender_award: ['{org} just awarded a contract — map the next phase and adjacent scope', '{org} رست عقداً للتو — حدد المرحلة التالية والنطاقات المجاورة'],
  cc_transformation: ['{org} is changing how it serves customers — position before an RFP', '{org} تعيد تشكيل خدمة عملائها — تموضع قبل طرح المناقصة'],
  gov_cx_programme: ['{org} launched a CX / digital programme — window to shape the approach', '{org} أطلقت برنامجاً لتجربة المتعاملين — فرصة للمساهمة في رسم النهج'],
  service_ratings: ['{org} service ratings are out — offer a fast CX health check', 'نُشرت تقييمات خدمات {org} — اعرض فحصاً سريعاً لتجربة المتعاملين'],
  regulation: ['New rule affects {org}’s service operations — lead with compliance-ready delivery', 'تشريع جديد يؤثر على عمليات {org} — ابدأ بنموذج تنفيذ متوافق'],
  regional_hq: ['{org} is setting up in the region — offer bilingual CX from day one', '{org} تؤسس حضوراً إقليمياً — اعرض خدمة عملاء ثنائية اللغة من اليوم الأول'],
  new_entity: ['New entity {org} needs service operations — be the first CX conversation', 'جهة جديدة {org} تحتاج عمليات خدمة — كن أول محادثة حول تجربة العملاء'],
  leader_appointed: ['New leader at {org} — meet in their first 90 days', 'قيادة جديدة في {org} — التقِ بها خلال أول 90 يوماً'],
  mna: ['{org} deal reshapes its operations — offer integration and continuity', 'صفقة {org} تعيد تشكيل عملياتها — اعرض الدمج واستمرارية الخدمة'],
  expansion: ['{org} is expanding — customer operations need to scale with it', '{org} تتوسع — عمليات العملاء تحتاج أن تتوسع معها'],
  hiring_cs: ['{org} is hiring customer-service staff — offer a faster, flexible alternative', '{org} توظف لخدمة العملاء — اعرض بديلاً أسرع وأكثر مرونة'],
  funding: ['{org} raised funding — help it scale support without building a team', '{org} حصلت على تمويل — ساعدها على توسيع الدعم دون بناء فريق'],
  new_licence: ['{org} got a new licence — launch regulated customer operations fast', '{org} حصلت على ترخيص جديد — أطلق عمليات عملاء منظَّمة بسرعة'],
  cross_border: ['{org} is crossing borders — one partner for bilingual support in each market', '{org} تتوسع خارجياً — شريك واحد لدعم ثنائي اللغة في كل سوق'],
  complaints: ['{org} customers are complaining publicly — offer a rapid fix', 'عملاء {org} يشتكون علناً — اعرض حلاً سريعاً'],
  seasonal_peak: ['{org} has a peak season coming — offer surge capacity', 'موسم ذروة قادم لدى {org} — اعرض سعة إضافية مرنة'],
  competitor_move: ['Market move: {org}', 'تحرك في السوق: {org}'],
};

const fill = (s: string, org: string) => s.replace('{org}', org);

export function buildPlay(i: PlayInput, offers: Offer[], rates: RateCard[]) {
  const orgEn = i.orgName ?? 'This organisation';
  const orgAr = i.orgNameAr ?? i.orgName ?? 'هذه الجهة';
  const [hEn, hAr] = HEAD[i.signalType] ?? HEAD.expansion!;
  const matched = matchOffers(i, offers);
  const proof = matched.flatMap((o) => o.proof_points)[0] ?? null;
  const value = estimateValue(i, rates);
  const roles = i.orgType === 'government' || i.orgType === 'semi_government' ? BUYER_ROLES.government : i.track === 'smb' ? BUYER_ROLES.smb : BUYER_ROLES.default;

  // Why now — every bullet is a fact from a stored snapshot
  const src = i.sources[0];
  const whyNow: { en: string; ar: string; snapshotId: string; kind: 'fact' }[] = [];
  if (src) whyNow.push({ en: `Reported: “${i.titleEn ?? i.title}” (${src.outlet})`, ar: `ورد في الخبر: «${i.title}» (${src.outlet})`, snapshotId: src.snapshotId, kind: 'fact' });
  if (i.amountText && src) whyNow.push({ en: `Value mentioned in source: ${i.amountText}`, ar: `القيمة المذكورة في المصدر: ${i.amountText}`, snapshotId: src.snapshotId, kind: 'fact' });
  if (i.deadline && src) whyNow.push({ en: `Date in source: ${i.deadline}`, ar: `التاريخ الوارد في المصدر: ${i.deadline}`, snapshotId: src.snapshotId, kind: 'fact' });
  if (i.sources.length > 1) whyNow.push({ en: `Corroborated by ${i.sources.length} outlets`, ar: `مؤكَّد من ${i.sources.length} مصادر`, snapshotId: i.sources[1].snapshotId, kind: 'fact' });
  if (i.roles && src) whyNow.push({ en: `${i.roles} customer-service roles mentioned`, ar: `ذُكرت ${i.roles} وظيفة لخدمة العملاء`, snapshotId: src.snapshotId, kind: 'fact' });

  const risks: { en: string; ar: string }[] = [];
  risks.push({ en: 'Budget approval status unknown', ar: 'حالة اعتماد الميزانية غير معروفة' });
  if (!i.orgName) risks.push({ en: 'Organisation not confirmed from source — verify before outreach', ar: 'لم تُؤكد الجهة من المصدر — تحقق قبل التواصل' });
  if (i.sources.length === 1) risks.push({ en: 'Single source — not yet corroborated', ar: 'مصدر واحد — غير مؤكد بعد' });
  if ((i.scores?.access?.score ?? 0) < 40) risks.push({ en: 'No warm path recorded — cold approach', ar: 'لا يوجد طريق دافئ — تواصل مباشر بارد' });
  if (i.competitors.length) risks.push({ en: `Competitor mentioned: ${i.competitors.join(', ')}`, ar: `منافس مذكور: ${i.competitors.join('، ')}` });
  if (i.signalType === 'tender') risks.push({ en: 'Check eligibility, local-content and registration requirements in the tender documents', ar: 'تحقق من الأهلية ومتطلبات المحتوى المحلي والتسجيل في وثائق المناقصة' });

  return {
    headline: fill(hEn, orgEn), headline_ar: fill(hAr, orgAr),
    why_now: whyNow, buyer_roles: roles, offer_keys: matched.map((o) => o.key),
    proof_point: proof ? JSON.stringify(proof) : null,
    value_low_usd: value.lowUsd, value_high_usd: value.highUsd, size_band: value.band, value_assumptions: value.assumptions,
    risks, outreach: templateOutreach(i, matched, proof, orgEn, orgAr),
  };
}

/** Template outreach — grounded, never sent. Formal Gulf business Arabic for government, warmer for private. */
export function templateOutreach(i: PlayInput, offers: Offer[], proof: { text: string } | null, orgEn: string, orgAr: string) {
  const gov = i.orgType === 'government' || i.orgType === 'semi_government';
  const o = offers[0];
  const offerEn = o?.name_en ?? 'customer experience services', offerAr = o?.name_ar ?? 'خدمات تجربة العملاء';
  const pitchEn = o?.pitch_en ?? '', pitchAr = o?.pitch_ar ?? '';
  const news = i.titleEn ?? i.title;
  const proofEn = proof ? ` For context: ${proof.text}` : '';
  const greetAr = gov ? 'سعادة/ [الاسم] المحترم،\nتحية طيبة وبعد،' : 'مرحباً [الاسم]،';
  const closeAr = gov ? 'وتفضلوا بقبول فائق الاحترام والتقدير،\n[اسمك]\nكونسنتريكس — الإمارات' : 'مع أطيب التحيات،\n[اسمك]\nكونسنتريكس';

  const en = {
    email: {
      subject: `${orgEn} — ${offerEn}`,
      body: `Dear [Name],\n\nI read the recent news: “${news}”. Moments like this usually put pressure on customer operations — volumes, languages and service levels all have to keep up.\n\nConcentrix runs bilingual Arabic/English customer experience from our UAE sites. ${pitchEn}${proofEn}\n\nWould a 20-minute conversation in the next two weeks be useful? I can share how similar organisations in the region approached this.\n\nKind regards,\n[Your name]\nConcentrix — UAE`,
    },
    note: `Hi [Name] — saw the news about ${orgEn} (“${news.slice(0, 90)}”). We help organisations in the UAE scale bilingual customer operations quickly. Open to a short chat?`,
    opener: `“Hello [Name], this is [Your name] from Concentrix. I’m calling because of the recent news that ${news.slice(0, 120)}. Usually that changes what customers need from your service teams — is that something you’re working on now?”`,
    followups: [
      `Day 3 — Short bump: “Following up on my note about ${orgEn}. Happy to send a one-page view of how we would approach it.”`,
      `Day 8 — Value: share one relevant Concentrix proof point${proof ? ` (${proof.text})` : ''} and offer a CX health check.`,
      `Day 15 — Invite: offer a visit to the Concentrix Dubai experience centre, or close the loop politely.`,
    ],
  };
  const ar = {
    email: {
      subject: `${orgAr} — ${offerAr}`,
      body: `${greetAr}\n\nاطلعتُ على ما نُشر مؤخراً: «${i.title}». وعادةً ما تفرض مثل هذه المرحلة متطلبات جديدة على عمليات خدمة المتعاملين من حيث الأحجام واللغات ومستويات الخدمة.\n\nتقدم كونسنتريكس خدمات تجربة العملاء باللغتين العربية والإنجليزية من مواقعها في دولة الإمارات. ${pitchAr}\n\nهل يناسبكم لقاء قصير مدته 20 دقيقة خلال الأسبوعين القادمين، لنستعرض كيف تعاملت جهات مماثلة في المنطقة مع هذا التحول؟\n\n${closeAr}`,
    },
    note: gov
      ? `السلام عليكم [الاسم]، اطلعتُ على خبر ${orgAr} الأخير. نعمل مع جهات في الدولة على تطوير خدمة المتعاملين باللغتين. يسعدني ترتيب حديث قصير متى ما ناسبكم.`
      : `مرحباً [الاسم]، قرأت خبر ${orgAr} الأخير. نساعد الشركات في الإمارات على توسيع خدمة العملاء باللغتين بسرعة. هل تمانع حديثاً قصيراً؟`,
    opener: gov
      ? `«السلام عليكم [الاسم]، معك [اسمك] من كونسنتريكس. أتواصل معكم بخصوص ما نُشر مؤخراً عن ${orgAr}. عادةً ما يغيّر ذلك احتياجات المتعاملين من فرق الخدمة — هل هذا من أولوياتكم حالياً؟»`
      : `«مرحباً [الاسم]، معك [اسمك] من كونسنتريكس. اتصلت بسبب خبركم الأخير. غالباً ما يعني ذلك ضغطاً أكبر على فريق خدمة العملاء — هل تعملون على ذلك الآن؟»`,
    followups: [
      `اليوم 3 — تذكير قصير: «أتابع رسالتي بخصوص ${orgAr}، ويسعدني إرسال تصور من صفحة واحدة لطريقة تعاملنا مع الموضوع.»`,
      `اليوم 8 — قيمة: مشاركة مثال نجاح مناسب من كونسنتريكس وعرض فحص سريع لتجربة المتعاملين.`,
      `اليوم 15 — دعوة: دعوة لزيارة مركز التجربة لدى كونسنتريكس في دبي، أو إنهاء التواصل بلباقة.`,
    ],
  };
  return { en, ar };
}
