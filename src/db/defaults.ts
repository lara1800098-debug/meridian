import { sql } from './index';

/** Default configuration. Every value here is Admin-editable in the UI afterwards. */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  weights: {
    enterprise: { fit: 0.3, intent: 0.3, timing: 0.25, access: 0.15 },
    smb: { fit: 0.35, intent: 0.25, timing: 0.25, access: 0.15 },
    competitor: { fit: 0.25, intent: 0.35, timing: 0.3, access: 0.1 },
  },
  tiers: { leader: 75, team: 55 },
  playThreshold: 55,
  models: {
    classify: 'claude-haiku-5-5',
    translate: 'claude-haiku-5-5',
    outreach: 'claude-opus-5-5',
    brief: 'claude-opus-5-5',
    tender: 'claude-opus-5-5',
    nba: 'claude-opus-5-5',
  },
  aiDailyBudgetUsd: 10,
  aiEnabled: true,
  staleDays: 90,
  coverageThreshold: 3,
  realistic: { atRiskFactor: 0.5, watchFactor: 0.8 },
  closeDatePushLimit: 2,
  valueChangePct: 30,
  // Approximate dates — Admin should confirm each year (moon-sighting dependent).
  lowActivityPeriods: [
    { name: 'Ramadan 2027 (approx.)', from: '2027-02-08', to: '2027-03-09' },
    { name: 'Eid al-Fitr 2027 (approx.)', from: '2027-03-09', to: '2027-03-12' },
    { name: 'Eid al-Adha 2027 (approx.)', from: '2027-05-15', to: '2027-05-19' },
    { name: 'Summer slowdown 2027', from: '2027-07-01', to: '2027-08-31' },
    { name: 'Year-end holidays 2026', from: '2026-12-24', to: '2027-01-02' },
  ],
  crawler: { perDomainDelayMs: 4000, timeoutMs: 20000, maxItemsPerRun: 40 },
  pilotCountries: ['AE'],
};

const STAGES = [
  ['identified', 'Identified', 'محددة', 1, 5, [], 21, 14, false],
  ['qualified', 'Qualified', 'مؤهلة', 2, 15, ['economic_buyer', 'compelling_event', 'value'], 30, 14, false],
  ['engaged', 'Engaged', 'تواصل فعلي', 3, 25, ['economic_buyer', 'compelling_event', 'value', 'next_step'], 30, 14, false],
  ['solutioning', 'Solutioning', 'تصميم الحل', 4, 40, ['economic_buyer', 'compelling_event', 'value', 'champion'], 45, 14, false],
  ['proposal', 'Proposal submitted', 'تم تقديم العرض', 5, 55, ['economic_buyer', 'compelling_event', 'value', 'champion', 'scope', 'decision_date'], 45, 21, false],
  ['negotiation', 'Negotiation', 'التفاوض', 6, 75, ['economic_buyer', 'compelling_event', 'value', 'champion', 'scope', 'decision_date'], 30, 10, false],
  ['won', 'Won', 'تم الفوز', 7, 100, [], 0, 0, true],
  ['lost', 'Lost', 'خسارة', 8, 0, [], 0, 0, true],
  ['no_decision', 'No decision', 'بلا قرار', 9, 0, [], 0, 0, true],
] as const;

// Indicative FX per 1 USD — Admin must maintain.
const FX = [['USD', 1], ['AED', 3.6725], ['SAR', 3.75], ['EGP', 48.5], ['JOD', 0.709], ['TRY', 41.5]] as const;

// PLACEHOLDER rate cards (USD per seat per month). Replace with CNX-approved ranges.
const RATE_CARDS = [
  ['AE', 'voice_inbound', 2600, 3800], ['AE', 'omnichannel', 2400, 3500], ['AE', 'back_office', 1800, 2800],
  ['SA', 'voice_inbound', 2800, 4200], ['SA', 'omnichannel', 2600, 3900],
  ['EG', 'voice_inbound', 900, 1500], ['EG', 'omnichannel', 850, 1400],
  ['JO', 'voice_inbound', 1100, 1800], ['TR', 'voice_inbound', 1300, 2100],
] as const;

// Initial list — edit in Admin → Competitors.
const COMPETITORS: [string, string[]][] = [
  ['Teleperformance', ['TP', 'Majorel', 'تيليبرفورمانس']],
  ['Foundever', ['Sitel', 'فاونديفر']],
  ['TTEC', []], ['Transcom', []], ['Alorica', []],
  ['TELUS Digital', ['TELUS International']], ['Sutherland', []], ['Firstsource', []],
  ['iSON Xperiences', ['iSON']], ['Tech Mahindra', []],
];

/**
 * Offer catalogue seeded from Concentrix's public service lines (concentrix.com, checked 2026-11-26).
 * Proof points are only the public figures shown on those pages, with their URL. Admin adds internal case studies.
 */
const OFFERS = [
  {
    key: 'managed_cc', name_en: 'Managed contact centre (Arabic/English)', name_ar: 'مركز اتصال مُدار (عربي/إنجليزي)',
    pitch_en: 'Bilingual customer care run from Concentrix UAE sites, scaled to your peaks.',
    pitch_ar: 'خدمة عملاء ثنائية اللغة تُدار من مواقع كونسنتريكس في الإمارات، وتتوسع مع مواسم الذروة لديكم.',
    ideal_signals: ['cc_transformation', 'tender', 'hiring_cs', 'expansion', 'regional_hq', 'seasonal_peak', 'new_entity'],
    ideal_sectors: ['government', 'telecom', 'bfsi', 'healthcare', 'retail', 'travel', 'utilities'],
    ideal_types: ['government', 'semi_government', 'private', 'smb'],
    proof_points: [], source_url: 'https://www.concentrix.com/services-solutions/customer-service/',
  },
  {
    key: 'ix_hello', name_en: 'AI agents / conversational AI (iX Hello)', name_ar: 'وكلاء ذكاء اصطناعي ومحادثة آلية (iX Hello)',
    pitch_en: 'Customer-facing AI assistants across chat, SMS and voice — built from blueprints in weeks.',
    pitch_ar: 'مساعدون أذكياء يخدمون العملاء عبر المحادثة والرسائل والصوت، يُبنون خلال أسابيع.',
    ideal_signals: ['gov_cx_programme', 'cc_transformation', 'funding', 'new_licence', 'service_ratings'],
    ideal_sectors: ['government', 'bfsi', 'telecom', 'retail', 'travel', 'fintech'],
    ideal_types: ['government', 'semi_government', 'private', 'startup'],
    proof_points: [], source_url: 'https://www.concentrix.com/ix-hello/',
  },
  {
    key: 'ix_hero', name_en: 'Agent assist (iX Hero)', name_ar: 'مساعدة موظفي خدمة العملاء (iX Hero)',
    pitch_en: 'Agentic AI on the advisor desktop: instant answers, live transcripts, less after-call work.',
    pitch_ar: 'ذكاء اصطناعي على شاشة الموظف: إجابات فورية ونصوص مباشرة للمكالمات وعمل أقل بعد المكالمة.',
    ideal_signals: ['cc_transformation', 'service_ratings', 'leader_appointed', 'gov_cx_programme'],
    ideal_sectors: ['government', 'telecom', 'bfsi', 'healthcare', 'utilities'],
    ideal_types: ['government', 'semi_government', 'private'],
    proof_points: [{ text: '13.5% improvement in customer satisfaction in iX Hero client pilot implementations (public figure).', url: 'https://www.concentrix.com/ix-hero/' }],
    source_url: 'https://www.concentrix.com/ix-hero/',
  },
  {
    key: 'cx_strategy', name_en: 'CX strategy & advisory', name_ar: 'استراتيجية واستشارات تجربة العملاء',
    pitch_en: 'Set the experience vision and roadmap, and build the business case for AI in service.',
    pitch_ar: 'وضع رؤية تجربة العملاء وخارطة الطريق وبناء دراسة الجدوى للذكاء الاصطناعي في الخدمة.',
    ideal_signals: ['gov_cx_programme', 'new_entity', 'leader_appointed', 'regulation', 'mna'],
    ideal_sectors: ['government', 'bfsi', 'healthcare', 'utilities', 'real_estate'],
    ideal_types: ['government', 'semi_government', 'private'],
    proof_points: [], source_url: 'https://www.concentrix.com/services-solutions/strategy/experience-strategy/',
  },
  {
    key: 'cx_health_check', name_en: 'CX health check / Voice of the Customer', name_ar: 'فحص صحة تجربة العملاء / صوت العميل',
    pitch_en: 'A fast, fixed-scope diagnostic of where customers struggle today — with a prioritised fix list.',
    pitch_ar: 'تشخيص سريع ومحدد النطاق لمواطن معاناة العملاء اليوم مع قائمة أولويات للتحسين.',
    ideal_signals: ['service_ratings', 'complaints', 'leader_appointed', 'cc_transformation'],
    ideal_sectors: ['government', 'telecom', 'bfsi', 'retail', 'utilities', 'healthcare'],
    ideal_types: ['government', 'semi_government', 'private', 'smb'],
    proof_points: [], source_url: 'https://www.concentrix.com/services-solutions/voice-customer/',
  },
  {
    key: 'training_quality', name_en: 'Training & quality transformation', name_ar: 'تحويل التدريب والجودة',
    pitch_en: 'Lift quality scores fast with AI-supported coaching, simulations and QA.',
    pitch_ar: 'رفع مؤشرات الجودة بسرعة عبر التدريب المدعوم بالذكاء الاصطناعي والمحاكاة وضمان الجودة.',
    ideal_signals: ['service_ratings', 'regulation', 'hiring_cs'],
    ideal_sectors: ['government', 'healthcare', 'bfsi', 'telecom'],
    ideal_types: ['government', 'semi_government', 'private'],
    proof_points: [], source_url: 'https://www.concentrix.com/ix-hero/',
  },
  {
    key: 'b2b_b2c_sales', name_en: 'Outsourced sales (B2B / B2C)', name_ar: 'خدمات المبيعات (للشركات والأفراد)',
    pitch_en: 'Demand generation, inside sales and digital sales run by specialist teams.',
    pitch_ar: 'توليد الطلب والمبيعات الداخلية والرقمية عبر فرق متخصصة.',
    ideal_signals: ['funding', 'expansion', 'new_licence', 'regional_hq'],
    ideal_sectors: ['technology', 'telecom', 'fintech', 'retail', 'bfsi'],
    ideal_types: ['private', 'startup', 'smb'],
    proof_points: [
      { text: 'Named highest designated Leader in Everest Group B2B Sales Services PEAK Matrix® 2026 (public).', url: 'https://www.concentrix.com/services-solutions/b2b-sales/' },
      { text: '200% increase in lead conversion for a SaaS provider (public case figure).', url: 'https://www.concentrix.com/services-solutions/revenue-growth/' },
    ],
    source_url: 'https://www.concentrix.com/services-solutions/revenue-growth/',
  },
  {
    key: 'collections', name_en: 'Collections & revenue recovery', name_ar: 'التحصيل واسترداد الإيرادات',
    pitch_en: 'Customer-friendly, compliant collections with digital self-service and AI decisioning.',
    pitch_ar: 'تحصيل ملتزم ولطيف مع العملاء عبر الخدمة الذاتية الرقمية وقرارات مدعومة بالذكاء الاصطناعي.',
    ideal_signals: ['new_licence', 'expansion', 'funding', 'regulation'],
    ideal_sectors: ['bfsi', 'fintech', 'telecom', 'utilities'],
    ideal_types: ['private', 'startup', 'smb', 'semi_government'],
    proof_points: [], source_url: 'https://www.concentrix.com/services-solutions/collection-services/',
  },
  {
    key: 'trust_safety', name_en: 'Trust & safety / content moderation (Arabic)', name_ar: 'الثقة والأمان وإدارة المحتوى (بالعربية)',
    pitch_en: 'Arabic-language moderation and fraud/risk operations with regional cultural context.',
    pitch_ar: 'إدارة محتوى وعمليات مكافحة احتيال باللغة العربية مع فهم للسياق الثقافي المحلي.',
    ideal_signals: ['new_licence', 'regulation', 'expansion', 'funding'],
    ideal_sectors: ['technology', 'media', 'fintech', 'retail'],
    ideal_types: ['private', 'startup'],
    proof_points: [], source_url: 'https://www.concentrix.com/services-solutions/trust-safety/',
  },
  {
    key: 'experience_visit', name_en: 'Dubai experience-centre visit', name_ar: 'زيارة مركز التجربة في دبي',
    pitch_en: 'Invite the buyer to the Dubai flagship demo zones to see AI + human CX working live.',
    pitch_ar: 'دعوة صاحب القرار لزيارة مناطق العرض في موقع دبي الرئيسي لمشاهدة تجربة العملاء بالذكاء الاصطناعي والبشر مباشرة.',
    ideal_signals: ['gov_cx_programme', 'leader_appointed', 'regional_hq', 'new_entity', 'cc_transformation'],
    ideal_sectors: [], ideal_types: ['government', 'semi_government', 'private'],
    proof_points: [], source_url: 'https://gulfnews.com/business/corporate-news/concentrix-expands-dubai-site-unveils-new-ai-features-to-revolutionise-customer-experience-1.500266970',
  },
];

/**
 * Candidate public sources. All ship DISABLED with terms_checked=false unless verified.
 * Verification notes are from a reachability probe on 2026-11-26 from a cloud container (not a UAE IP).
 */
const SOURCES = [
  // type, name, url, lang, category, quality, full_text, enabled, terms_checked, notes
  ['rss', 'The National — main feed', 'https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml', 'en', 'business_news', 4, false, true, false, 'Feed reachable (HTTP 200). Headline+excerpt only. Confirm terms before production.'],
  ['rss', 'Wamda — startup news', 'https://www.wamda.com/feed', 'en', 'startup', 3, false, true, false, 'Feed reachable (HTTP 200, 20 items). Headline+excerpt only.'],
  ['search', 'Google News — UAE CX/contact centre (EN)', 'https://news.google.com/rss/search?q=(UAE%20OR%20Dubai%20OR%20%22Abu%20Dhabi%22)%20(%22contact%20centre%22%20OR%20%22call%20center%22%20OR%20%22customer%20experience%22%20OR%20%22customer%20happiness%22)%20when:14d&hl=en-AE&gl=AE&ceid=AE:en', 'en', 'aggregator', 3, false, false, false, 'DISABLED: news.google.com robots.txt disallows /rss/search for automated agents (verified 2026-11-26). Kept for reference only.'],
  ['search', 'Google News — UAE tenders & RFPs (EN)', 'https://news.google.com/rss/search?q=(UAE%20OR%20Dubai%20OR%20%22Abu%20Dhabi%22)%20(tender%20OR%20RFP%20OR%20%22awarded%20contract%22)%20(customer%20OR%20services%20OR%20digital)%20when:14d&hl=en-AE&gl=AE&ceid=AE:en', 'en', 'aggregator', 3, false, false, false, 'DISABLED: robots.txt disallows (see above).'],
  ['search', 'Google News — UAE regional HQ / market entry (EN)', 'https://news.google.com/rss/search?q=(UAE%20OR%20Dubai%20OR%20%22Abu%20Dhabi%22)%20(%22regional%20headquarters%22%20OR%20%22opens%20office%22%20OR%20%22launches%20in%20the%20UAE%22)%20when:14d&hl=en-AE&gl=AE&ceid=AE:en', 'en', 'aggregator', 3, false, false, false, 'DISABLED: robots.txt disallows (see above).'],
  ['search', 'Google News — UAE funding rounds (EN)', 'https://news.google.com/rss/search?q=(UAE%20OR%20Dubai%20OR%20%22Abu%20Dhabi%22)%20startup%20(raises%20OR%20funding%20OR%20%22Series%20A%22%20OR%20%22Series%20B%22)%20when:14d&hl=en-AE&gl=AE&ceid=AE:en', 'en', 'aggregator', 3, false, false, false, 'DISABLED: robots.txt disallows (see above).'],
  ['search', 'Google News — UAE government digital/AI (EN)', 'https://news.google.com/rss/search?q=(UAE%20OR%20Dubai%20OR%20%22Abu%20Dhabi%22)%20government%20(%22AI%22%20OR%20digital%20OR%20%22customer%20service%22)%20launch%20when:14d&hl=en-AE&gl=AE&ceid=AE:en', 'en', 'aggregator', 3, false, false, false, 'DISABLED: robots.txt disallows (see above).'],
  ['search', 'Google News — خدمة العملاء الإمارات (AR)', 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%A5%D9%85%D8%A7%D8%B1%D8%A7%D8%AA%20(%22%D8%AE%D8%AF%D9%85%D8%A9%20%D8%A7%D9%84%D8%B9%D9%85%D9%84%D8%A7%D8%A1%22%20OR%20%22%D9%85%D8%B1%D9%83%D8%B2%20%D8%A7%D8%AA%D8%B5%D8%A7%D9%84%22%20OR%20%22%D8%AA%D8%AC%D8%B1%D8%A8%D8%A9%20%D8%A7%D9%84%D9%85%D8%AA%D8%B9%D8%A7%D9%85%D9%84%D9%8A%D9%86%22)%20when:14d&hl=ar&gl=AE&ceid=AE:ar', 'ar', 'aggregator', 3, false, false, false, 'DISABLED: robots.txt disallows (see above).'],
  ['search', 'Google News — مناقصات الإمارات (AR)', 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%A5%D9%85%D8%A7%D8%B1%D8%A7%D8%AA%20(%D9%85%D9%86%D8%A7%D9%82%D8%B5%D8%A9%20OR%20%D8%AA%D8%B1%D8%B3%D9%8A%D8%A9%20OR%20%D8%B9%D9%82%D8%AF)%20%D8%AE%D8%AF%D9%85%D8%A7%D8%AA%20when:14d&hl=ar&gl=AE&ceid=AE:ar', 'ar', 'aggregator', 3, false, false, false, 'DISABLED: robots.txt disallows (see above).'],
  ['search', 'Google News — حكومة الإمارات ذكاء اصطناعي (AR)', 'https://news.google.com/rss/search?q=(%D8%AD%D9%83%D9%88%D9%85%D8%A9%20%D8%AF%D8%A8%D9%8A%20OR%20%D8%A3%D8%A8%D9%88%D8%B8%D8%A8%D9%8A%20OR%20%D8%A7%D9%84%D8%A5%D9%85%D8%A7%D8%B1%D8%A7%D8%AA)%20(%D8%A7%D9%84%D8%B0%D9%83%D8%A7%D8%A1%20%D8%A7%D9%84%D8%A7%D8%B5%D8%B7%D9%86%D8%A7%D8%B9%D9%8A%20OR%20%D8%A7%D9%84%D8%AA%D8%AD%D9%88%D9%84%20%D8%A7%D9%84%D8%B1%D9%82%D9%85%D9%8A)%20%D8%A5%D8%B7%D9%84%D8%A7%D9%82%20when:14d&hl=ar&gl=AE&ceid=AE:ar', 'ar', 'aggregator', 3, false, false, false, 'DISABLED: robots.txt disallows (see above).'],
  ['search', 'Google News — Competitor moves UAE (EN)', 'https://news.google.com/rss/search?q=(Teleperformance%20OR%20Foundever%20OR%20TTEC%20OR%20Transcom%20OR%20Alorica%20OR%20%22TELUS%20Digital%22)%20(UAE%20OR%20Dubai%20OR%20%22Saudi%22)%20when:30d&hl=en-AE&gl=AE&ceid=AE:en', 'en', 'competitor', 3, false, false, false, 'DISABLED: robots.txt disallows (see above).'],
  ['rss', 'The National — business', 'https://www.thenationalnews.com/arc/outboundfeeds/rss/category/business/?outputType=xml', 'en', 'business_news', 4, false, true, false, 'Verified 2026-11-26: 100 items, robots.txt permits. Headline+excerpt only.'],
  ['rss', 'Gulf News — main feed', 'https://gulfnews.com/feed', 'en', 'business_news', 4, false, true, false, 'Verified 2026-11-26: 46 items, robots.txt permits. Headline+excerpt only.'],
  ['rss', 'Arab News — main feed', 'https://www.arabnews.com/rss.xml', 'en', 'business_news', 4, false, true, false, 'Verified 2026-11-26: 50 items, robots.txt permits. Regional (KSA-weighted).'],
  ['rss', 'Asharq Al-Awsat (English)', 'https://english.aawsat.com/feed', 'en', 'business_news', 4, false, true, false, 'Verified 2026-11-26: 300 items, robots.txt permits.'],
  ['rss', 'الشرق الأوسط (Asharq Al-Awsat, Arabic)', 'https://aawsat.com/feed', 'ar', 'business_news', 4, false, true, false, 'Verified 2026-11-26: 300 items (Arabic), robots.txt permits.'],
  ['rss', 'Saudi Gazette', 'https://saudigazette.com.sa/rssFeed/74', 'en', 'business_news', 3, false, true, false, 'Verified 2026-11-26: 50 items. KSA-focused — useful for UAE↔KSA expansion signals.'],
  ['rss', 'Abu Dhabi Media Office — Economy', 'https://www.mediaoffice.abudhabi/en/economy/rss/', 'en', 'government', 5, true, true, false, 'Official government feed (ADMO RSS page). Verified 2026-11-26: 24 items, robots.txt permits.'],
  ['rss', 'Abu Dhabi Media Office — Government affairs', 'https://www.mediaoffice.abudhabi/en/government-affairs/rss/', 'en', 'government', 5, true, true, false, 'Official government feed (ADMO RSS page). Verified 2026-11-26: 24 items, robots.txt permits.'],
  ['rss', 'Abu Dhabi Media Office — Health', 'https://www.mediaoffice.abudhabi/en/health/rss/', 'en', 'government', 5, true, true, false, 'Official government feed (ADMO RSS page). Verified 2026-11-26: 24 items, robots.txt permits.'],
  ['rss', 'Abu Dhabi Media Office — Technology', 'https://www.mediaoffice.abudhabi/en/technology/rss/', 'en', 'government', 5, true, true, false, 'Official government feed (ADMO RSS page). Verified 2026-11-26: 24 items, robots.txt permits.'],
  ['rss', 'Abu Dhabi Media Office — Transport', 'https://www.mediaoffice.abudhabi/en/transport/rss/', 'en', 'government', 5, true, true, false, 'Official government feed (ADMO RSS page). Verified 2026-11-26: 24 items, robots.txt permits.'],
  ['rss', 'Abu Dhabi Media Office — الاقتصاد', 'https://www.mediaoffice.abudhabi/ar/economy/rss', 'ar', 'government', 5, true, true, false, 'Official government feed (ADMO RSS page). Verified 2026-11-26: 24 items, robots.txt permits.'],
  ['rss', 'Abu Dhabi Media Office — الشؤون الحكومية', 'https://www.mediaoffice.abudhabi/ar/government-affairs/rss', 'ar', 'government', 5, true, true, false, 'Official government feed (ADMO RSS page). Verified 2026-11-26: 24 items, robots.txt permits.'],
  ['rss', 'Abu Dhabi Media Office — الصحة', 'https://www.mediaoffice.abudhabi/ar/health/rss', 'ar', 'government', 5, true, true, false, 'Official government feed (ADMO RSS page). Verified 2026-11-26: 24 items, robots.txt permits.'],
  ['rss', 'Gulf Today', 'https://www.gulftoday.ae/rssFeed/0', 'en', 'business_news', 3, false, true, false, 'Verified 2026-11-26: 50 items, robots.txt permits. Headline+excerpt only.'],
  ['sitemap', 'Emirates 24|7 — news sitemap', 'https://www.emirates247.com/newsSitemap.xml', 'en', 'business_news', 3, false, true, false, 'Google-News-style sitemap (headlines only). Verified 2026-11-26: 69 items, robots.txt permits.'],
  ['rss', 'Daily News Egypt', 'https://www.dailynewsegypt.com/feed/', 'en', 'business_news', 3, false, true, false, 'Egypt coverage. Verified 2026-11-26: robots.txt permits. Headline+excerpt only.'],
  ['rss', 'Egypt Independent', 'https://www.egyptindependent.com/feed/', 'en', 'business_news', 3, false, true, false, 'Egypt coverage. Verified 2026-11-26: robots.txt permits. Headline+excerpt only.'],
  ['rss', 'Jordan News', 'https://www.jordannews.jo/rss', 'en', 'business_news', 3, false, true, false, 'Jordan coverage. Verified 2026-11-26: robots.txt permits. (Jordan Times disallows automated reading.)'],
  // Official — feed endpoints found but returned no items from this probe; verify from UAE VM.
  ['rss', 'WAM — Emirates News Agency (EN)', 'https://www.wam.ae/en/rss', 'en', 'government', 5, true, false, false, 'Endpoint returned 200 but no <item> elements in probe. Verify feed URL & terms, then enable.'],
  ['rss', 'Dubai Media Office (EN)', 'https://www.mediaoffice.ae/en/rss', 'en', 'government', 5, true, false, false, 'Endpoint returned 200 but no items in probe. Verify.'],
  ['rss', 'Saudi Press Agency', 'https://www.spa.gov.sa/rss', 'ar', 'government', 5, true, false, false, 'KSA — out of UAE pilot scope. No items in probe.'],
  // Blocked to automated readers in probe — keep disabled; respect the publisher.
  ['rss', 'Zawya', 'https://www.zawya.com/sitemaps/en/rss', 'en', 'business_news', 4, false, false, false, 'HTTP 403 to automated reader. Disabled — do not bypass.'],
  ['rss', 'Arabian Business', 'https://www.arabianbusiness.com/feed', 'en', 'business_news', 3, false, false, false, 'HTTP 403; robots.txt disallows /rss. Disabled.'],
  ['rss', 'AGBI', 'https://www.agbi.com/feed/', 'en', 'business_news', 4, false, false, false, 'HTTP 405. Disabled.'],
  ['rss', 'MENAbytes', 'https://www.menabytes.com/feed/', 'en', 'startup', 3, false, false, false, 'HTTP 403 and robots.txt disallows /feed. Disabled.'],
  ['rss', 'Al Khaleej', 'https://www.alkhaleej.ae/rss.xml', 'ar', 'business_news', 3, false, false, false, 'HTTP 403. Disabled.'],
    ['rss', 'Khaleej Times', 'https://www.khaleejtimes.com/rss', 'en', 'business_news', 4, false, false, false, 'Feed URL not found (404). Find official feed and check terms.'],
  ['rss', 'Al Bayan', 'https://www.albayan.ae/rss', 'ar', 'business_news', 3, false, false, false, 'Feed URL not found (404).'],
  ['page', 'UAE federal procurement — public notices', 'https://www.mof.gov.ae/', 'en', 'procurement', 5, false, false, false, 'Portal requires login for most notices. Use Tender Reader upload instead. Do not bypass access control.'],
] as const;

const EVENTS = [
  ['GITEX Global 2026', 'Dubai', '2026-12-07', '2026-12-11', ['government', 'technology', 'telecom', 'bfsi'], ['GITEX'], 'Verify dates on the official site.'],
  ['LEAP 2027', 'Riyadh', '2027-02-08', '2027-02-11', ['technology', 'government'], ['LEAP'], 'KSA — outside UAE pilot. Verify dates.'],
  ['World Government Summit 2027', 'Dubai', '2027-02-09', '2027-02-11', ['government'], ['World Government Summit', 'القمة العالمية للحكومات'], 'Verify dates.'],
  ['Arab Health 2027', 'Dubai', '2027-01-25', '2027-01-28', ['healthcare'], ['Arab Health'], 'Verify dates.'],
] as const;

export async function ensureDefaults() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await sql`INSERT INTO settings (key, value) VALUES (${key}, ${sql.json(value as any)}) ON CONFLICT (key) DO NOTHING`;
  }
  for (const s of STAGES) {
    await sql`INSERT INTO stages (key,name_en,name_ar,sort,probability,entry_criteria,norm_days,stale_days,is_closed)
      VALUES (${s[0]},${s[1]},${s[2]},${s[3]},${s[4]},${s[5] as unknown as string[]},${s[6]},${s[7]},${s[8]}) ON CONFLICT (key) DO NOTHING`;
  }
  for (const [c, r] of FX) await sql`INSERT INTO fx_rates (currency, per_usd) VALUES (${c}, ${r}) ON CONFLICT DO NOTHING`;
  for (const [c, t, mn, mx] of RATE_CARDS)
    await sql`INSERT INTO rate_cards (country, service_type, min_usd_per_seat_month, max_usd_per_seat_month) VALUES (${c},${t},${mn},${mx}) ON CONFLICT DO NOTHING`;
  for (const [n, a] of COMPETITORS) await sql`INSERT INTO competitors (name, aliases) VALUES (${n}, ${a}) ON CONFLICT DO NOTHING`;
  for (const o of OFFERS) {
    await sql`INSERT INTO offers (key,name_en,name_ar,pitch_en,pitch_ar,ideal_signals,ideal_sectors,ideal_types,proof_points,source_url)
      VALUES (${o.key},${o.name_en},${o.name_ar},${o.pitch_en},${o.pitch_ar},${o.ideal_signals},${o.ideal_sectors},${o.ideal_types},${sql.json(o.proof_points)},${o.source_url})
      ON CONFLICT (key) DO NOTHING`;
  }
  for (const s of SOURCES) {
    await sql`INSERT INTO sources (type,name,url,lang,category,quality,store_full_text,enabled,terms_checked,notes)
      VALUES (${s[0]},${s[1]},${s[2]},${s[3]},${s[4]},${s[5]},${s[6]},${s[7]},${s[8]},${s[9]}) ON CONFLICT (url) DO NOTHING`;
  }
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM events`;
  if (n === 0) for (const e of EVENTS)
    await sql`INSERT INTO events (name,city,start_date,end_date,sectors,keywords,notes) VALUES (${e[0]},${e[1]},${e[2]},${e[3]},${e[4] as unknown as string[]},${e[5] as unknown as string[]},${e[6]})`;
}
