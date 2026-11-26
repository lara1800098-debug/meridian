/**
 * Rules-based bilingual (Arabic + English) signal classifier and extractor.
 * Works with no AI key. When an AI key is present, the AI classifier (lib/ai/tasks.ts) refines this output,
 * but every extracted fact must still appear in the source text (see groundCheck).
 */
import { SIGNAL_TYPES, type SignalType, type Sector, type Track } from '../taxonomy';

type Rule = { type: SignalType; en: RegExp[]; ar: RegExp[]; weight?: number };

const R = (s: string) => new RegExp(s, 'i');

export const RULES: Rule[] = [
  { type: 'tender_cancelled', en: [R('\\btender\\b.{0,40}\\b(cancel+ed|re-?issued|withdrawn|scrapped)'), R('\\b(cancel+s?|scraps?)\\b.{0,30}\\b(tender|rfp)')], ar: [/(إلغاء|ألغت|إعادة طرح).{0,30}(مناقصة|المناقصة)/] },
  { type: 'competitor_award', en: [R('(awarded|wins?|won|secures?)\\b.{0,60}\\b(contract|deal|mandate)\\b')], ar: [/(ترسية|فوز|فازت).{0,40}(عقد|مناقصة)/], weight: 0 }, // only used when a competitor is named (see below)
  { type: 'tender_award', en: [R('\\b(awarded|awards|wins?|won|secures?)\\b.{0,60}\\b(contract|tender|deal)\\b')], ar: [/(ترسية|ترسي|فوز|فازت|يفوز).{0,40}(عقد|مناقصة)/] },
  { type: 'tender', en: [R('\\b(tender|rfp|rfi|rfq|eoi|expression of interest|request for proposals?|invites? bids|bidding)\\b')], ar: [/(مناقصة|مناقصات|طرح|تدعو).{0,20}(عروض|مناقص|توريد)?|طلب عروض|كراسة الشروط|منافسة عامة/] },
  { type: 'cc_transformation', en: [R('\\b(contact[- ]cent(er|re)s?|call[- ]cent(er|re)s?|customer (care|service|support) (cent(er|re)|operations|transformation)|omnichannel|customer happiness cent(er|re))\\b')], ar: [/مركز (الاتصال|اتصال|خدمة العملاء|سعادة المتعاملين)|مراكز الاتصال|خدمة العملاء|سعادة المتعاملين/] },
  { type: 'gov_cx_programme', en: [R('\\b(government|ministry|authority|federal|municipality)\\b.{0,80}\\b(AI|artificial intelligence|digital (services|transformation)|customer experience|service delivery|proactive services|zero bureaucracy)\\b'), R('\\b(customer experience|CX) (strategy|programme|program|charter)\\b')], ar: [/(حكومة|وزارة|هيئة|دائرة|بلدية|مركز|مجلس|سلطة).{0,80}(الذكاء الاصطناعي|التحول الرقمي|تجربة المتعاملين|الخدمات الرقمية|الخدمات الاستباقية|تصفير البيروقراطية)/, /(الذكاء الاصطناعي|التحول الرقمي).{0,60}(تجربة المتعاملين|خدمات المتعاملين)/] },
  { type: 'service_ratings', en: [R('\\b(star rating|service ratings?|global star rating|customer satisfaction (index|survey|results)|mystery shopper)\\b')], ar: [/(نظام النجوم|تصنيف النجوم|مؤشر سعادة|رضا المتعاملين|المتسوق السري)/] },
  { type: 'regulation', en: [R('\\b(emirati[sz]ation|nafis|saudi[sz]ation|nitaqat|data (protection|residency) law|personal data protection|consumer protection (law|regulation))\\b'), R('\\b(new (law|regulation|rules?|decree|resolution)|federal decree|cabinet resolution)\\b.{0,100}\\b(customers?|consumers?|outsourc\\w*|call cent(er|re)s?|contact cent(er|re)s?|data|workforce|labou?r|employment|telecoms?|banks?|banking|insurers?|insurance|payments?|service providers?)\\b')], ar: [/(التوطين|(?:^|[\s«(])نافس(?:[\s»)،.]|$)|حماية البيانات|حماية المستهلك)/, /(قانون جديد|مرسوم|قرار مجلس الوزراء|لائحة).{0,80}(العملاء|المستهلكين|البيانات|التوظيف|العمل|الاتصالات|البنوك|التأمين)/] },
  { type: 'regional_hq', en: [R('\\b(regional (headquarters|hq)|opens? (its )?(first )?(office|hub)|launch(es|ed)? (operations|in the UAE|in Dubai|in Abu Dhabi)|market entry|enters? the (UAE|GCC|Saudi))\\b')], ar: [/(مقر إقليمي|المقر الإقليمي|افتتاح مكتب|افتتحت مكتب|دخول السوق|تبدأ عملياتها)/] },
  { type: 'new_entity', en: [R('\\b(new (authority|entity|company|giga-?project|mega-?project)|establish(es|ed)? (a )?(new )?(authority|company|entity)|launch(es|ed)? (a )?new (airline|bank|platform|authority))\\b')], ar: [/(إنشاء|تأسيس|إطلاق) (هيئة|شركة|جهة|منصة) جديدة|مشروع ضخم/] },
  { type: 'leader_appointed', en: [R('\\b(appoint(s|ed)?|names?|named|hires?|promot(es|ed))\\b.{0,60}\\b(chief (customer|experience|digital|operating|technology) officer|C[DX]O|head of (customer|cx|digital|operations)|director of (customer|digital))')], ar: [/(تعيين|عيّن|يعين).{0,50}(الرئيس التنفيذي للعمليات|الرئيس التنفيذي للتجربة|مدير تجربة|الرئيس التنفيذي للتحول الرقمي|مدير إدارة المتعاملين)/], weight: 1.05 },
  { type: 'mna', en: [R('\\b(acquires?|acquired|acquisition|merger|merges?|IPO|initial public offering|privati[sz]ation|stake sale)\\b')], ar: [/(استحواذ|يستحوذ|اندماج|طرح عام أولي|اكتتاب|خصخصة)/] },
  { type: 'funding', en: [R('\\b(raises?|raised|secures?|closes?)\\b.{0,40}\\b(funding|round|investment|seed|series [a-e])\\b'), R('\\bseries [a-e]\\b')], ar: [/(جولة تمويل|تمويلاً|يجمع|جمعت|تمويل أولي|الفئة (أ|ب))/] },
  { type: 'hiring_cs', en: [R('\\b(hiring|recruit(ing|s)?|jobs?|vacanc(y|ies)|openings?)\\b.{0,60}\\b(customer (service|support|care|happiness)|call cent(er|re)|contact cent(er|re)|agents?)\\b')], ar: [/(توظيف|وظائف|شواغر).{0,40}(خدمة العملاء|مركز اتصال|سعادة المتعاملين)/] },
  { type: 'new_licence', en: [R('\\b(licen[cs]e[ds]?|granted (a )?licen[cs]e|regulatory approval|in-principle approval)\\b.{0,60}\\b(bank|fintech|insurance|payments?|telecom|healthcare|digital bank|VARA|CBUAE|DFSA|FSRA)\\b')], ar: [/(ترخيص|رخصة|موافقة مبدئية).{0,40}(مصرف|بنك|تأمين|مدفوعات|اتصالات|المصرف المركزي)/] },
  { type: 'cross_border', en: [R('\\b(expands? (in)?to|expansion (in)?to|launch(es|ed)? in)\\b.{0,30}\\b(Saudi|KSA|Riyadh|Egypt|Cairo|Jordan|UAE|Dubai|Qatar|Kuwait|Bahrain|Oman|Türkiye|Turkey)\\b')], ar: [/(توسع|يتوسع|التوسع).{0,20}(السعودية|مصر|الأردن|الإمارات|قطر|الكويت|البحرين|عُمان|تركيا)/] },
  { type: 'expansion', en: [R('\\b(expan(ds?|sion|ding)|opens?|launch(es|ed)?|rolls? out|scales? up)\\b.{0,60}\\b(stores?|branch(es)?|outlets?|hub|campus|terminal|operations|services|platform|app|offices?|customers?|routes?|clinics?|hospitals?|market)\\b')], ar: [/(توسع|توسعة|افتتاح|إطلاق|تطلق|أطلقت).{0,40}(فروع|فرع|متاجر|منصة|تطبيق|خدمات|عمليات|مكتب|مستشفى|عيادات|سوق)/], weight: 0.6 },
  { type: 'complaints', en: [R('\\b(complaints?|outage|customers? (frustrat|angry|stranded)|poor service|long wait)\\b')], ar: [/(شكاوى|شكوى|انقطاع|استياء العملاء)/] },
  { type: 'seasonal_peak', en: [R('\\b(ramadan|white friday|black friday|back[- ]to[- ]school|hajj|umrah|summer (peak|season)|peak season|DSF|dubai shopping festival)\\b')], ar: [/(رمضان|الجمعة البيضاء|العودة إلى المدارس|الحج|العمرة|موسم الصيف|مهرجان دبي للتسوق)/], weight: 0.7 },
  { type: 'budget_freeze', en: [R('\\b(layoffs?|lay off|job cuts|budget (freeze|cuts?)|restructur(e|ing)|hiring freeze|cost[- ]cutting)\\b')], ar: [/(تسريح|خفض الوظائف|تجميد الميزانية|إعادة هيكلة|خفض التكاليف)/], weight: 1.1 },
  { type: 'insourcing', en: [R('\\b(in-?sourc(e|es|ing)|bring(s|ing)? (it )?in-?house|own (contact|call) cent(er|re))\\b')], ar: [/(التشغيل الداخلي|داخلياً بدلاً من)/], weight: 1.1 },
  { type: 'sponsor_left', en: [R('\\b(steps? down|resign(s|ed)?|departs?|leaves?|replaced)\\b.{0,40}\\b(CEO|COO|CXO|CDO|chief|director|head)\\b')], ar: [/(استقالة|يستقيل|تنحي|مغادرة).{0,30}(الرئيس|المدير)/], weight: 0.9 },
];

const SECTOR_RULES: [Sector, RegExp][] = [
  ['government', /\b(ministry|government|federal|authority|municipality|police|RTA|emirate of|DEWA|ADGM|DIFC authority)\b|وزارة|حكومة|هيئة|دائرة|بلدية|شرطة|اتحادي/i],
  ['bfsi', /\b(bank|banking|insurance|insurer|takaful|lender|credit card)\b|بنك|مصرف|تأمين|تكافل/i],
  ['fintech', /\b(fintech|payments?|wallet|BNPL|neobank|digital bank|crypto|VARA)\b|تقنية مالية|مدفوعات|محفظة/i],
  ['telecom', /\b(telecom|e&|etisalat|\bdu\b|mobile operator|5G|telco)\b|اتصالات|الاتصالات|مشغل/i],
  ['healthcare', /\b(health|hospital|clinic|healthcare|pharma|medical|DHA|DoH)\b|صحة|مستشفى|طبي|الصحة/i],
  ['retail', /\b(retail|e-?commerce|store|mall|shopping|marketplace|grocery|delivery app)\b|تجزئة|تجارة إلكترونية|متجر|تسوق/i],
  ['travel', /\b(airline|airport|travel|tourism|hotel|hospitality|Emirates|Etihad|flydubai|cruise)\b|طيران|مطار|سياحة|فندق|سفر/i],
  ['utilities', /\b(utility|utilities|electricity|water|DEWA|ADDC|SEWA|FEWA)\b|كهرباء|مياه|مرافق/i],
  ['real_estate', /\b(real estate|property|developer|Emaar|Aldar|Nakheel|DAMAC)\b|عقار|عقارات|تطوير عقاري/i],
  ['logistics', /\b(logistics|shipping|courier|freight|port|DP World|Aramex)\b|لوجستي|شحن|موانئ/i],
  ['education', /\b(school|university|education|edtech|ADEK|KHDA)\b|تعليم|جامعة|مدرسة/i],
  ['automotive', /\b(automotive|car maker|dealership|EV maker|vehicles?)\b|سيارات|مركبات/i],
  ['energy', /\b(oil|gas|ADNOC|energy|renewable|solar)\b|نفط|غاز|طاقة/i],
  ['media', /\b(media|broadcaster|streaming|publisher|gaming)\b|إعلام|بث/i],
  ['technology', /\b(software|SaaS|tech(nology)? company|startup|platform|app|AI company|cloud)\b|تكنولوجيا|تقنية|منصة|تطبيق/i],
];

const COUNTRY_RULES: [string, RegExp][] = [
  ['AE', /\b(UAE|U\.A\.E|Emirates|Emirati[sz]ation|Emiratis?|Dubai|Abu Dhabi|Sharjah|Ajman|Ras Al Khaimah|Fujairah|Umm Al Quwain)\b|الإمارات|دبي|أبوظبي|أبو ظبي|الشارقة|عجمان|رأس الخيمة|الفجيرة/i],
  ['SA', /\b(Saudi|KSA|Riyadh|Jeddah|Dammam|NEOM)\b|السعودية|المملكة العربية السعودية|الرياض|جدة|الدمام|نيوم/i],
  ['EG', /\b(Egypt|Cairo|Alexandria)\b|مصر|القاهرة|الإسكندرية/i],
  ['JO', /\b(Jordan|Amman)\b|الأردن|عمّان|عمان الأردن/i],
  ['TR', /\b(Türkiye|Turkey|Istanbul|Ankara|Izmir)\b|تركيا|إسطنبول/i],
  ['QA', /\b(Qatar|Doha)\b|قطر|الدوحة/i],
  ['KW', /\bKuwait\b|الكويت/i],
  ['BH', /\b(Bahrain|Manama)\b|البحرين/i],
  ['OM', /\b(Oman|Muscat)\b|سلطنة عمان|مسقط/i],
];

export type Extraction = {
  signalType: SignalType;
  track: Track;
  sector: Sector;
  country: string;
  orgType: 'government' | 'semi_government' | 'private' | 'smb' | 'startup';
  orgNames: string[];
  competitors: string[];
  amountUsd: number | null;
  amountText: string | null;
  deadline: string | null;
  matched: string[]; // evidence phrases (must be substrings of the input)
  ruleStrength: number; // 0..1
  relevant: boolean; // false = no buying-signal pattern matched → not a signal
  roles: number | null; // e.g. number of CS roles for hiring signals
};

const FX_TO_USD: Record<string, number> = { AED: 1 / 3.6725, 'Dh': 1 / 3.6725, 'Dhs': 1 / 3.6725, SAR: 1 / 3.75, SR: 1 / 3.75, USD: 1, $: 1, EGP: 1 / 48.5, 'درهم': 1 / 3.6725, 'ريال': 1 / 3.75, 'دولار': 1, 'جنيه': 1 / 48.5 };
const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, 'ألف': 1e3, 'مليون': 1e6, 'مليار': 1e9 };

export function extractAmount(text: string): { usd: number; text: string } | null {
  const toLatin = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const en = /(AED|Dhs?|SAR|SR|USD|EGP|\$)\s?([\d,.]+)\s?(k|m|mn|million|b|bn|billion|thousand)?\b/i.exec(toLatin);
  if (en) {
    const n = parseFloat(en[2].replace(/,/g, ''));
    if (!Number.isFinite(n)) return null;
    const mult = en[3] ? MULT[en[3].toLowerCase()] ?? 1 : 1;
    const cur = en[1].toUpperCase() === 'DH' || en[1].toUpperCase() === 'DHS' ? 'AED' : en[1].toUpperCase();
    return { usd: n * mult * (FX_TO_USD[cur] ?? FX_TO_USD[en[1]] ?? 1), text: en[0] };
  }
  const en2 = /([\d,.]+)\s?(million|billion|m|bn)\s?(AED|dirhams?|SAR|riyals?|USD|dollars)/i.exec(toLatin);
  if (en2) {
    const n = parseFloat(en2[1].replace(/,/g, ''));
    const cur = /aed|dirham/i.test(en2[3]) ? 'AED' : /sar|riyal/i.test(en2[3]) ? 'SAR' : 'USD';
    return { usd: n * MULT[en2[2].toLowerCase()] * FX_TO_USD[cur], text: en2[0] };
  }
  const ar = /([\d,.]+)\s?(ألف|مليون|مليار)?\s?(درهم|ريال|دولار|جنيه)/.exec(toLatin);
  if (ar) {
    const n = parseFloat(ar[1].replace(/,/g, ''));
    return { usd: n * (ar[2] ? MULT[ar[2]] : 1) * FX_TO_USD[ar[3]], text: ar[0] };
  }
  return null;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11, 'يناير': 0, 'فبراير': 1, 'مارس': 2, 'أبريل': 3, 'مايو': 4, 'يونيو': 5, 'يوليو': 6, 'أغسطس': 7, 'سبتمبر': 8, 'أكتوبر': 9, 'نوفمبر': 10, 'ديسمبر': 11 };

export function extractDeadline(text: string, now = new Date()): string | null {
  const ctx = /(deadline|closing date|submission|submit|due|by|before|effective|from|starting|آخر موعد|الموعد النهائي|تقديم|اعتباراً من|بدءاً من|حتى)/i;
  const re = /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)[a-z]*,?\s+(20\d\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 50), m.index);
    if (!ctx.test(before)) continue;
    const d = new Date(Date.UTC(+m[3], MONTHS[m[2].toLowerCase().slice(0, 3)] ?? MONTHS[m[2]], +m[1]));
    if (d > now) return d.toISOString().slice(0, 10);
  }
  return null;
}

const ORG_EN = /\b((?:[A-Z][\w&'.-]*\s){0,5}(?:Authority|Ministry|Department|Council|Bank|Group|Holding|Airways|Airlines|Airport|Telecom|Insurance|Municipality|Police|Corporation|Company|Hospital|Health|Properties|Capital|Ventures|Technologies|Pay|Exchange|Foundation|Commission|Office|Centre|Center|University|Fund|Development)(?:\s(?:of|for)\s(?:the\s)?(?:[A-Z][\w&'.-]*\s?){1,4})?)/g;
const ORG_AR = /((?:وزارة|هيئة|دائرة|مجلس|بنك|مصرف|شركة|مجموعة|بلدية|شرطة|مؤسسة|صندوق|سلطة|مكتب|مستشفى)\s(?:[؀-ۿ]+\s?){1,4})/g;

const ROLE_WORDS = /^(Chief|Head|Director|Vice|VP|Senior|Managing|General Manager)\b|\bOfficer$/;

export function extractOrgs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(ORG_EN)) { const s = m[1].trim().replace(/^(The|A|Competitor|New)\s/, ''); if (s.split(' ').length >= 2 && s.length < 80 && !ROLE_WORDS.test(s)) out.add(s); }
  for (const m of text.matchAll(ORG_AR)) out.add(m[1].trim());
  return [...out].slice(0, 6);
}

export function classify(text: string, competitorNames: string[] = []): Extraction {
  const isAr = /[؀-ۿ]/.test(text) && (text.match(/[؀-ۿ]/g)!.length > text.length * 0.3);
  const matched: string[] = [];
  const competitors = competitorNames.filter((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text) || text.includes(c));
  let best: { type: SignalType; score: number } | null = null;
  for (const rule of RULES) {
    const pats = [...rule.en, ...rule.ar];
    for (const p of pats) {
      const m = p.exec(text);
      if (!m) continue;
      if (rule.type === 'competitor_award' && competitors.length === 0) continue;
      let score = rule.weight ?? 1;
      if (rule.type === 'competitor_award') score = 1.2; // pipeline keeps it as 'against' only if we have an open deal at that org
      if (!best || score > best.score) best = { type: rule.type, score };
      matched.push(m[0].slice(0, 120));
      break;
    }
  }
  let signalType: SignalType = best?.type ?? 'expansion';
  if (signalType === 'competitor_award') signalType = 'competitor_move';
  if (competitors.length && !['competitor_award'].includes(signalType) && !/\b(Concentrix)\b/i.test(text)) {
    // A story led by a competitor is a market move unless it's an award against our deal.
    if (best && ['tender_award', 'expansion', 'cc_transformation', 'mna', 'leader_appointed', 'hiring_cs'].includes(best.type)) signalType = 'competitor_move';
  }
  const sector = (SECTOR_RULES.find(([, re]) => re.test(text))?.[0] ?? 'other') as Sector;
  const country = COUNTRY_RULES.find(([, re]) => re.test(text))?.[0] ?? 'XX'; // XX = not in MET/GCC (or not stated)
  const orgType: Extraction['orgType'] = sector === 'government' ? (/\b(PJSC|holding|company)\b|شركة/i.test(text) ? 'semi_government' : 'government')
    : /\b(startup|start-up|seed|series [a-c]|founded in 20(1|2)\d)\b|ناشئة/i.test(text) ? 'startup'
    : /\b(SME|SMB|small business)\b/i.test(text) ? 'smb' : 'private';
  let track: Track = SIGNAL_TYPES[signalType];
  if (track === 'enterprise' && (orgType === 'startup' || orgType === 'smb')) track = 'smb';
  if (track === 'smb' && (orgType === 'government' || orgType === 'semi_government')) track = 'enterprise';
  const amt = extractAmount(text);
  const rolesM = /(\d{1,4})\s+(?:new\s+)?(?:customer (?:service|support|care)|call cent(?:er|re)|contact cent(?:er|re))?\s*(?:roles|jobs|positions|agents|vacancies)/i.exec(text) || /(\d{1,4})\s+(?:وظيفة|وظائف|شاغر)/.exec(text);
  return {
    signalType, track, sector, country, orgType,
    orgNames: extractOrgs(text), competitors,
    amountUsd: amt ? Math.round(amt.usd) : null, amountText: amt?.text ?? null,
    deadline: extractDeadline(text), matched: [...new Set(matched)].slice(0, 4),
    ruleStrength: best ? Math.min(1, best.score) * (matched.length > 1 ? 1 : 0.85) : 0.3,
    relevant: !!best,
    roles: rolesM ? parseInt(rolesM[1], 10) : null,
  };
}

/** Grounding check: every extracted string must literally appear in the source text. Used to reject AI hallucinations. */
export function groundCheck(source: string, values: (string | null | undefined)[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const src = norm(source);
  return values.filter(Boolean).every((v) => src.includes(norm(v!)));
}

export const isArabic = (s: string) => (s.match(/[؀-ۿ]/g)?.length ?? 0) > s.length * 0.25;
