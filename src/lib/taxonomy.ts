export type Track = 'enterprise' | 'smb' | 'competitor' | 'against';

export const SIGNAL_TYPES = {
  gov_cx_programme: 'enterprise', cc_transformation: 'enterprise', tender: 'enterprise', tender_award: 'enterprise',
  regulation: 'enterprise', service_ratings: 'enterprise', regional_hq: 'enterprise', new_entity: 'enterprise',
  leader_appointed: 'enterprise', mna: 'enterprise', expansion: 'enterprise',
  hiring_cs: 'smb', funding: 'smb', new_licence: 'smb', cross_border: 'smb', complaints: 'smb', seasonal_peak: 'smb',
  competitor_move: 'competitor',
  budget_freeze: 'against', sponsor_left: 'against', tender_cancelled: 'against', competitor_award: 'against', insourcing: 'against',
} as const satisfies Record<string, Track>;
export type SignalType = keyof typeof SIGNAL_TYPES;
export const SIGNAL_TYPE_KEYS = Object.keys(SIGNAL_TYPES) as SignalType[];

/** Base intent strength per signal type (0–100). An awarded tender > a vague strategy speech. */
export const BASE_INTENT: Record<SignalType, number> = {
  tender: 90, tender_award: 70, cc_transformation: 85, gov_cx_programme: 75, regulation: 65, service_ratings: 60,
  regional_hq: 70, new_entity: 65, leader_appointed: 60, mna: 50, expansion: 60,
  hiring_cs: 75, funding: 60, new_licence: 65, cross_border: 60, complaints: 55, seasonal_peak: 50,
  competitor_move: 55, budget_freeze: 0, sponsor_left: 0, tender_cancelled: 0, competitor_award: 0, insourcing: 0,
};

export const SECTORS = ['government', 'bfsi', 'fintech', 'telecom', 'healthcare', 'retail', 'travel', 'utilities', 'real_estate', 'technology', 'media', 'education', 'logistics', 'automotive', 'energy', 'other'] as const;
export type Sector = (typeof SECTORS)[number];

/** Sector fit for CNX MET (likely contact volume, Arabic/bilingual need, regulated). Admin can tune later. */
export const SECTOR_FIT: Record<Sector, number> = {
  government: 95, telecom: 90, bfsi: 90, utilities: 85, healthcare: 85, travel: 80, retail: 80, fintech: 80,
  real_estate: 65, logistics: 70, automotive: 70, energy: 55, education: 60, technology: 65, media: 55, other: 40,
};

export const COUNTRIES = ['AE', 'SA', 'EG', 'JO', 'TR', 'QA', 'KW', 'BH', 'OM'] as const;
export const DELIVERY_COUNTRIES = ['AE', 'SA', 'EG', 'JO', 'TR']; // where CNX MET delivers (public locations page)
export const CURRENCIES = ['AED', 'SAR', 'USD', 'EGP', 'JOD', 'TRY'] as const;
export const ORG_TYPES = ['government', 'semi_government', 'private', 'smb', 'startup'] as const;
export const LOSS_REASONS = ['price', 'capability', 'relationship', 'timing', 'incumbent', 'insourced', 'cancelled', 'other'] as const;
export const DISMISS_REASONS = ['not_relevant', 'existing_client', 'too_small', 'no_access', 'duplicate', 'bad_source', 'other'] as const;
export const DEAL_SOURCES = ['meridian', 'referral', 'inbound', 'event', 'other'] as const;

export const BUYER_ROLES: Record<string, string[]> = {
  government: ['Director of Customer Happiness', 'Chief Digital / Innovation Officer', 'Director of Government Services', 'Procurement lead'],
  default: ['Chief Customer / Experience Officer', 'Head of Customer Service / Contact Centre', 'COO', 'Chief Digital Officer'],
  smb: ['Founder / CEO', 'COO / Head of Operations', 'Head of Customer Support'],
};

export const BUYER_ROLES_AR: Record<string, string> = {
  'Director of Customer Happiness': 'مدير سعادة المتعاملين', 'Chief Digital / Innovation Officer': 'الرئيس التنفيذي للتحول الرقمي / الابتكار',
  'Director of Government Services': 'مدير الخدمات الحكومية', 'Procurement lead': 'مسؤول المشتريات',
  'Chief Customer / Experience Officer': 'الرئيس التنفيذي لتجربة العملاء', 'Head of Customer Service / Contact Centre': 'رئيس خدمة العملاء / مركز الاتصال',
  COO: 'الرئيس التنفيذي للعمليات', 'Chief Digital Officer': 'الرئيس التنفيذي للتحول الرقمي', 'Founder / CEO': 'المؤسس / الرئيس التنفيذي',
  'COO / Head of Operations': 'الرئيس التنفيذي للعمليات / رئيس العمليات', 'Head of Customer Support': 'رئيس دعم العملاء',
};
export const SECTOR_AR: Record<string, string> = {
  government: 'الحكومة', bfsi: 'البنوك والتأمين', fintech: 'التقنية المالية', telecom: 'الاتصالات', healthcare: 'الرعاية الصحية', retail: 'التجزئة', travel: 'السفر والسياحة',
  utilities: 'المرافق', real_estate: 'العقارات', technology: 'التكنولوجيا', media: 'الإعلام', education: 'التعليم', logistics: 'اللوجستيات', automotive: 'السيارات', energy: 'الطاقة', other: 'أخرى',
};
