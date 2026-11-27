/**
 * Clean-buyer gate: an opportunity is shown to sales only when it names a real organisation that could buy from us
 * and the news is a buying signal we can sell into. Everything else stays visible as market news (Trends), never as a lead.
 */
export type BuyerInput = { org: string | null | undefined; title: string; type: string; offers?: string[] | null };
export type BuyerVerdict = { clean: boolean; reason: null | 'no_org' | 'generic_org' | 'investor' | 'too_small' | 'no_offer' | 'advertorial' | 'not_cx' | 'not_business' };

// Umbrella names — a government or a place is market context, not a buyer we can contact.
const GENERIC_ORG = /^(?:the\s+)?(?:(?:government of\s+)?(?:abu dhabi|dubai|sharjah|ajman|ras al khaimah|fujairah|umm al quwain|uae|united arab emirates|the uae|emirates|saudi arabia|saudi|ksa|kingdom of saudi arabia|egypt|jordan|gcc|mena|middle east|gulf)(?:\s+government)?|government|federal government|ministry|authority|council|cabinet)$/i;
const GENERIC_AR = /^(?:حكومة\s+)?(?:أبوظبي|دبي|الشارقة|الإمارات|دولة الإمارات|السعودية|المملكة|مصر|الأردن)$|^(?:الحكومة|الوزارة|الهيئة|المجلس)$/;
// Investors and funds are not service buyers — the companies they back are.
const INVESTOR_ORG = /\b(?:partners|ventures|venture capital|capital|fund|funds|investments?|asset management|private equity|angels?|vc|accelerator|incubator)\b/i;
const FUND_NEWS = /\b(?:closes?|closing|launch(?:es|ed)?|raises?)\b[^.]{0,40}\bfund\b|\bfund (?:close|closing)\b|صندوق/i;
const ADVERTORIAL = /\b(?:a hub for|offers? seamless|why (?:an?|the) .+ is a smart|buyer'?s guide|guide to|tips for|things to (?:do|know)|best .+ to buy|how to|deals? of the (?:day|week)|review:)\b/i;
const NON_CX_CONTRACT = /\b(?:construct|build(?:ing)?|villas?|towers?|roads?|bridges?|infrastructure|civil works|EPC|pipeline|drilling|dredging|substation|metro line)\b/i;
const CX_WORDS = /customer|contact cent|call cent|service|experience|\bCX\b|digital|app|platform|support|خدمة|المتعاملين|مركز اتصال/i;
// Not a business story: conflict, crime, courts, accidents, protocol visits. Never a sales lead, whoever is named.
const NOT_BUYER_ORG = /\b(?:houthis?|hamas|hezbollah|isis|daesh|taliban|al-?qaeda|militia|rebels?|court|courts|prosecution|public prosecutor|police|army|armed forces)\b|الحوثي|حماس|حزب الله|محكمة|النيابة|الشرطة/i;
const NOT_BUSINESS = /\b(?:attacks?|attacked|kill(?:s|ed|ing)?|dies|died|dead|death|injur(?:ed|ies)|missile|drone strike|explosion|court (?:orders|rules|ruling|sentences)|sentenced|jailed|arrested|convicted|lawsuit|sues|fraud|scam|smuggl\w*|crash|fire breaks|earthquake|flood|weather|rain|condolences?|mourns|tours? .{0,40}pavilion|visits? .{0,40}(?:pavilion|stand|booth))\b|هجوم|مقتل|وفاة|حادث|محكمة|حكم بال|القبض|يعزي|تعزية/i;
const SMALL_ROUND = /\b(?:pre-?seed|seed|angel|pre-series a)\b/i;

/** Parse the largest money amount in a headline, in USD (USD, AED/Dh, SAR, EGP, JOD). Null when none is stated. */
export function amountUsd(text: string): number | null {
  const fx: Record<string, number> = { usd: 1, '$': 1, us$: 1, aed: 1 / 3.6725, dh: 1 / 3.6725, dhs: 1 / 3.6725, sar: 1 / 3.75, sr: 1 / 3.75, egp: 1 / 48, jod: 1.41 };
  const unit: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };
  let best: number | null = null;
  const re = /(us\$|\$|usd|aed|dhs?|sar|sr|egp|jod)\s?(\d+(?:[.,]\d+)?)\s?(k|thousand|mn|m|million|bn|b|billion)?\b/gi;
  for (const m of text.matchAll(re)) {
    const v = parseFloat(m[2].replace(',', '.')) * (m[3] ? unit[m[3].toLowerCase()] : 1) * fx[m[1].toLowerCase()];
    if (!isNaN(v) && (best == null || v > best)) best = v;
  }
  return best;
}

export function buyerCheck(p: BuyerInput): BuyerVerdict {
  const org = String(p.org ?? '').trim();
  if (!org || org.length < 3 || /^\d+$/.test(org)) return { clean: false, reason: 'no_org' };
  if (GENERIC_ORG.test(org) || GENERIC_AR.test(org)) return { clean: false, reason: 'generic_org' };
  if (INVESTOR_ORG.test(org) || (p.type === 'funding' && FUND_NEWS.test(p.title))) return { clean: false, reason: 'investor' };
  if (NOT_BUYER_ORG.test(org) || NOT_BUSINESS.test(p.title)) return { clean: false, reason: 'not_business' };
  if (ADVERTORIAL.test(p.title)) return { clean: false, reason: 'advertorial' };
  if (!(p.offers ?? []).length) return { clean: false, reason: 'no_offer' };
  if (['tender_award', 'tender'].includes(p.type) && NON_CX_CONTRACT.test(p.title) && !CX_WORDS.test(p.title)) return { clean: false, reason: 'not_cx' };
  if (p.type === 'funding') {
    // A round has to be big enough that the company will buy outsourced CX or sales capacity within a year.
    const usd = amountUsd(p.title);
    if (SMALL_ROUND.test(p.title) || usd == null || usd < 10e6) return { clean: false, reason: 'too_small' };
  }
  return { clean: true, reason: null };
}

/** Arabic names of organisations that also appear in English, so one logo is not shown twice. */
export const AR_ALIASES: Record<string, string> = {
  'بيورهيلث': 'PureHealth', 'بيور هيلث': 'PureHealth', 'دائرة التمكين الحكومي': 'Department of Government Enablement',
  'دائرة التمكين الحكومي – أبوظبي': 'Department of Government Enablement', 'مصرف دبي الإسلامي': 'Dubai Islamic Bank', 'بنك دبي الإسلامي': 'Dubai Islamic Bank',
  'الإمارات دبي الوطني': 'Emirates NBD', 'بنك الإمارات دبي الوطني': 'Emirates NBD', 'الإمارات الإسلامي': 'Emirates Islamic', 'مصرف الإمارات الإسلامي': 'Emirates Islamic',
  'اتصالات': 'e&', 'دو': 'du', 'طيران الإمارات': 'Emirates', 'الاتحاد للطيران': 'Etihad Airways', 'هيئة كهرباء ومياه دبي': 'DEWA', 'ديوا': 'DEWA',
  'هيئة الطرق والمواصلات': 'RTA', 'إم 42': 'M42', 'مبادلة': 'Mubadala', 'أدنوك': 'ADNOC', 'الدار': 'Aldar', 'إعمار': 'Emaar', 'نخيل': 'Nakheel',
};
