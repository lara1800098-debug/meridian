import { aiJson } from './client';
import { prompt, sourceDoc } from './prompts';
import { groundCheck } from '../engine/classify';
import { SECTORS, SIGNAL_TYPE_KEYS, type SignalType, type Sector } from '../taxonomy';

const str = { type: 'string' } as const;
const nstr = { type: ['string', 'null'] } as const;
const obj = (props: Record<string, any>) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });

export async function aiTranslate(id: string, title: string, excerpt: string, target: 'English' | 'Arabic') {
  const r = await aiJson<{ title: string; excerpt: string }>({
    task: 'translate', user: `${prompt('translate', { target }).text}\n\n${sourceDoc(id, title, excerpt)}`,
    schema: obj({ title: str, excerpt: str }), maxTokens: 1500,
  });
  return r?.data ?? null;
}

export type AiClass = { signal_type: SignalType; sector: Sector; country: string; org_type: string; organisation_en: string | null; organisation_ar: string | null; amount_text: string | null; deadline: string | null; confidence: number; evidence: string[] };

/** AI refinement of classification. Rejected (null) if any extracted name/amount/quote is not literally in the source. */
export async function aiClassify(id: string, title: string, text: string): Promise<AiClass | null> {
  const r = await aiJson<AiClass>({
    task: 'classify',
    user: `${prompt('classify', { types: SIGNAL_TYPE_KEYS.join(', '), sectors: SECTORS.join(', ') }).text}\n\n${sourceDoc(id, title, text)}`,
    schema: obj({
      signal_type: { type: 'string', enum: SIGNAL_TYPE_KEYS }, sector: { type: 'string', enum: [...SECTORS] }, country: str,
      org_type: { type: 'string', enum: ['government', 'semi_government', 'private', 'smb', 'startup'] },
      organisation_en: nstr, organisation_ar: nstr, amount_text: nstr, deadline: nstr, confidence: { type: 'number' }, evidence: { type: 'array', items: str },
    }),
    maxTokens: 1200,
  });
  if (!r) return null;
  const d = r.data;
  const full = `${title}\n${text}`;
  if (!groundCheck(full, [d.organisation_en, d.organisation_ar, d.amount_text, ...d.evidence])) return null; // hallucination guard
  return d;
}

export type Outreach = { email: { subject: string; body: string }; note: string; opener: string; followups: string[] };
export async function aiOutreach(p: { org: string; orgType: string; offer: string; pitch: string; proof: string; docs: { id: string; title: string; body: string }[] }) {
  const o = obj({ email: obj({ subject: str, body: str }), note: str, opener: str, followups: { type: 'array', items: str } });
  const r = await aiJson<{ en: Outreach; ar: Outreach }>({
    task: 'outreach', effort: 'medium',
    user: `${prompt('outreach', { org: p.org, orgType: p.orgType, offer: p.offer, pitch: p.pitch, proof: p.proof }).text}\n\n${p.docs.map((d) => sourceDoc(d.id, d.title, d.body)).join('\n')}`,
    schema: obj({ en: o, ar: o }), maxTokens: 5000,
  });
  return r?.data ?? null;
}

export async function aiBrief(lang: 'en' | 'ar', data: unknown) {
  const r = await aiJson<{ headline: string[]; decisions: string[] }>({
    task: 'brief', effort: 'medium',
    user: `${prompt('brief', { lang: lang === 'ar' ? 'Arabic' : 'English' }).text}\n\n<structured_data>\n${JSON.stringify(data).slice(0, 20000)}\n</structured_data>`,
    schema: obj({ headline: { type: 'array', items: str }, decisions: { type: 'array', items: str } }), maxTokens: 2000,
  });
  return r?.data ?? null;
}

export type TenderField = { value: string | null; quote: string | null };
export const TENDER_FIELDS = ['issuer', 'scope', 'services', 'volumes', 'languages', 'channels', 'locations', 'slas', 'penalties', 'contract_length', 'evaluation_criteria', 'local_content', 'data_residency', 'certifications', 'clarification_deadline', 'submission_deadline', 'submission_format'] as const;
export async function aiTender(id: string, filename: string, text: string) {
  const f = obj({ value: nstr, quote: nstr });
  const r = await aiJson<{ fields: Record<string, TenderField> }>({
    task: 'tender', effort: 'medium',
    user: `${prompt('tender').text}\n\n${sourceDoc(id, filename, text.slice(0, 60000))}`,
    schema: obj({ fields: obj(Object.fromEntries(TENDER_FIELDS.map((k) => [k, f]))) }), maxTokens: 6000,
  });
  if (!r) return null;
  // Drop any quote not literally present in the document.
  for (const [k, v] of Object.entries(r.data.fields)) if (v.quote && !groundCheck(text, [v.quote])) r.data.fields[k] = { value: null, quote: null };
  return r.data.fields;
}

export async function aiNba(deal: unknown, reasons: unknown, docs: { id: string; title: string; body: string }[]) {
  const r = await aiJson<{ action: string; reason: string }>({
    task: 'nba',
    user: `${prompt('nba').text}\n\n<deal>${JSON.stringify(deal)}</deal>\n<health>${JSON.stringify(reasons)}</health>\n${docs.map((d) => sourceDoc(d.id, d.title, d.body)).join('\n')}`,
    schema: obj({ action: str, reason: str }), maxTokens: 800,
  });
  return r?.data ?? null;
}
