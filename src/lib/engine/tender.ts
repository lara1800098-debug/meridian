/** Rules-based tender extraction with verbatim citations, plus a Go/No-Go checklist. AI (if configured) can fill gaps, but every value must carry a quote found in the document. */
import { DELIVERY_COUNTRIES } from '../taxonomy';

export type Cited = { value: string | null; quote: string | null };
const KW: Record<string, RegExp> = {
  issuer: /(issued by|the (authority|ministry|department|entity|client)|purchaser|contracting authority|الجهة المتعاقدة|صاحب العمل|الجهة الطالبة)/i,
  scope: /(scope of (work|services)|statement of work|objective|نطاق العمل|نطاق الخدمات)/i,
  services: /(inbound|outbound|contact cent|call cent|customer service|helpdesk|back[- ]office|chat|خدمة العملاء|مركز الاتصال)/i,
  volumes: /(\d[\d,]*\s*(calls|contacts|interactions|tickets|emails|chats)\s*(per|\/|a)\s*(month|year|day|annum))|(مكالمة|تواصل).{0,15}(شهري|سنوي)/i,
  languages: /\b(arabic|english|urdu|hindi|french|tagalog|languages?)\b|العربية|الإنجليزية|اللغات/i,
  channels: /\b(voice|phone|e-?mail|chat|whatsapp|social media|sms|web form|omni-?channel)\b|الهاتف|البريد الإلكتروني|المحادثة|واتساب/i,
  locations: /\b(on-?site|onsite|premises|located in|delivery location|Dubai|Abu Dhabi|Sharjah|Riyadh|UAE)\b|داخل الدولة|مقر/i,
  slas: /(service level|SLA|answer(ed)? within|abandon(ment)? rate|first contact resolution|FCR|CSAT|average handle|AHT|KPI)|مستوى الخدمة|مؤشرات الأداء/i,
  penalties: /(penalt|liquidated damages|deduction|service credit)|غرامة|غرامات|جزاءات/i,
  contract_length: /(contract (term|period|duration)|for a period of|\d+\s*(years?|months?)\s*(contract|term)|initial term)|مدة العقد/i,
  evaluation_criteria: /(evaluation criteria|technical (score|evaluation)|commercial (score|evaluation)|weighting|\d{1,2}\s*%\s*(technical|commercial|financial))|معايير التقييم|التقييم الفني/i,
  local_content: /(emirati[sz]ation|nafis|in-?country value|ICV|local content|saudi[sz]ation|nitaqat|nationals?)|التوطين|المحتوى المحلي|القيمة المحلية المضافة/i,
  data_residency: /(data (residency|localisation|localization|sovereignty)|hosted (in|within) the (UAE|country)|must not leave|NESA|DESC|IAS|PDPL)|إقامة البيانات|داخل الدولة|حماية البيانات/i,
  certifications: /\b(ISO\s?27001|ISO\s?9001|ISO\s?18295|COPC|PCI[- ]DSS|SOC\s?2|ISO\s?22301)\b/i,
  clarification_deadline: /(clarification|queries|questions).{0,40}(deadline|by|before|no later)|آخر موعد للاستفسارات/i,
  submission_deadline: /(submission|closing|bid|proposal|tender).{0,30}(deadline|date|due|by|no later)|آخر موعد لتقديم|موعد الإغلاق/i,
  submission_format: /(submit(ted)? (via|through|electronically|in hard copy)|sealed envelope|portal|two-envelope|technical and commercial proposals? separately)|يتم تقديم|مظروف/i,
};
export const FIELDS = Object.keys(KW);

function sentences(text: string) { return text.replace(/\r/g, '').split(/(?<=[.!?؟])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 8); }
const DATE = /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4}|\d{4}-\d{2}-\d{2})/i;

export function extractTender(text: string): Record<string, Cited> {
  const ss = sentences(text);
  const out: Record<string, Cited> = {};
  for (const [k, re] of Object.entries(KW)) {
    const hits = ss.filter((s) => re.test(s));
    const pick = k.endsWith('_deadline') ? hits.find((s) => DATE.test(s)) ?? null : hits[0] ?? null;
    if (!pick) { out[k] = { value: null, quote: null }; continue; }
    let value = pick.slice(0, 260);
    if (k.endsWith('_deadline')) value = DATE.exec(pick)?.[0] ?? value;
    if (k === 'languages') value = [...new Set(hits.join(' ').match(/\b(arabic|english|urdu|hindi|french|tagalog)\b|العربية|الإنجليزية/gi)?.map((x) => x.toLowerCase()) ?? [])].join(', ') || value;
    if (k === 'channels') value = [...new Set(hits.join(' ').match(/\b(voice|phone|e-?mail|chat|whatsapp|social media|sms)\b/gi)?.map((x) => x.toLowerCase()) ?? [])].join(', ') || value;
    if (k === 'certifications') value = [...new Set(hits.join(' ').match(KW.certifications) ?? [])].join(', ') || value;
    out[k] = { value, quote: pick.slice(0, 400) };
  }
  return out;
}

export function parseLooseDate(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s.trim());
  if (m) return new Date(Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]));
  const d = new Date(s); return isNaN(d.getTime()) ? null : d;
}

export type Check = { item: string; status: 'ok' | 'review' | 'block'; note: string };
export function goNoGo(f: Record<string, Cited>, now = new Date()) {
  const c: Check[] = [];
  const sub = parseLooseDate(f.submission_deadline?.value ?? null);
  if (!sub) c.push({ item: 'Submission deadline', status: 'review', note: 'Not found — confirm in the document' });
  else { const d = Math.round((sub.getTime() - now.getTime()) / 86400000); c.push({ item: 'Submission deadline', status: d < 0 ? 'block' : d < 10 ? 'review' : 'ok', note: d < 0 ? 'Deadline has passed' : `${d} days to respond` }); }
  const langs = (f.languages?.value ?? '').toLowerCase();
  const odd = langs.split(/,\s*/).filter((l) => l && !/arabic|english|العربية|الإنجليزية/.test(l));
  c.push({ item: 'Languages', status: !langs ? 'review' : odd.length ? 'review' : 'ok', note: !langs ? 'Not stated' : odd.length ? `Check capacity for: ${odd.join(', ')}` : 'Arabic/English — core CNX MET capability' });
  const loc = f.locations?.quote ?? '';
  c.push({ item: 'Delivery location', status: !loc ? 'review' : /on-?site|premises|مقر/i.test(loc) ? 'review' : 'ok', note: !loc ? 'Not stated' : /on-?site|premises/i.test(loc) ? 'On-site delivery may be required — check site model' : `Delivery footprint: ${DELIVERY_COUNTRIES.join(', ')}` });
  c.push({ item: 'Local content / nationalisation', status: f.local_content?.value ? 'review' : 'ok', note: f.local_content?.value ? 'Requirement found — confirm Emiratisation/ICV position' : 'No requirement found' });
  c.push({ item: 'Data residency / security', status: f.data_residency?.value ? 'review' : 'ok', note: f.data_residency?.value ? 'Requirement found — confirm hosting & security controls' : 'No requirement found' });
  c.push({ item: 'Certifications', status: f.certifications?.value ? 'review' : 'ok', note: f.certifications?.value ? `Required: ${f.certifications.value}` : 'None found' });
  c.push({ item: 'Penalties', status: f.penalties?.value ? 'review' : 'ok', note: f.penalties?.value ? 'Penalty regime present — price the risk' : 'None found' });
  c.push({ item: 'Evaluation criteria', status: f.evaluation_criteria?.value ? 'ok' : 'review', note: f.evaluation_criteria?.value ? 'Criteria stated' : 'Not found — ask in clarifications' });
  const rec = c.some((x) => x.status === 'block') ? 'nogo' : c.filter((x) => x.status === 'review').length >= 4 ? 'review' : 'go';
  return { checks: c, recommendation: rec as 'go' | 'nogo' | 'review' };
}
