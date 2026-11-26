import 'server-only';
import ExcelJS from 'exceljs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CURRENCIES, SECTORS, COUNTRIES } from './taxonomy';

export const IMPORT_FIELDS = [
  { key: 'title', required: true, guess: ['title', 'deal', 'opportunity', 'name', 'deal name', 'opportunity name', 'الصفقة'] },
  { key: 'organisation', required: false, guess: ['organisation', 'organization', 'account', 'company', 'client', 'prospect', 'customer', 'الجهة'] },
  { key: 'stage', required: true, guess: ['stage', 'status', 'phase', 'المرحلة'] },
  { key: 'tcv', required: true, guess: ['tcv', 'value', 'amount', 'total contract value', 'deal value', 'القيمة'] },
  { key: 'annual_value', required: false, guess: ['annual', 'acv', 'annual value', 'arr'] },
  { key: 'currency', required: false, guess: ['currency', 'ccy', 'العملة'] },
  { key: 'country', required: false, guess: ['country', 'market', 'الدولة'] },
  { key: 'sector', required: false, guess: ['sector', 'industry', 'vertical', 'القطاع'] },
  { key: 'track', required: false, guess: ['track', 'segment'] },
  { key: 'expected_close', required: false, guess: ['close date', 'expected close', 'close', 'closing date'] },
  { key: 'owner_email', required: false, guess: ['owner', 'owner email', 'ae', 'account executive', 'sales rep'] },
  { key: 'probability', required: false, guess: ['probability', 'prob', '%'] },
  { key: 'economic_buyer', required: false, guess: ['economic buyer', 'eb', 'decision maker'] },
  { key: 'champion', required: false, guess: ['champion', 'coach'] },
  { key: 'compelling_event', required: false, guess: ['compelling event', 'why now', 'driver'] },
  { key: 'next_step', required: false, guess: ['next step', 'next action'] },
  { key: 'next_step_date', required: false, guess: ['next step date', 'next action date'] },
  { key: 'last_activity', required: false, guess: ['last activity', 'last contact', 'last updated', 'modified'] },
  { key: 'source', required: false, guess: ['source', 'lead source', 'origin'] },
  { key: 'competitors', required: false, guess: ['competitors', 'competition'] },
  { key: 'notes', required: false, guess: ['notes', 'comments', 'description'] },
] as const;
export type FieldKey = (typeof IMPORT_FIELDS)[number]['key'];

const dir = () => path.resolve(process.env.UPLOAD_DIR || './uploads', 'imports');

export async function parseUpload(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error('File too large (max 10 MB)');
  const buf = Buffer.from(await file.arrayBuffer());
  let rows: string[][] = [];
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const vals = (r.values as any[]).slice(1).map((v) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? (v.text ?? v.result ?? v.richText?.map((x: any) => x.text).join('') ?? '') : String(v)));
      rows.push(vals);
    });
  } else rows = parseCsv(buf.toString('utf8').replace(/^﻿/, ''));
  rows = rows.filter((r) => r.some((c) => String(c).trim()));
  if (rows.length < 2) throw new Error('No data rows found');
  const id = randomUUID();
  await mkdir(dir(), { recursive: true, mode: 0o700 });
  await writeFile(path.join(dir(), `${id}.json`), JSON.stringify({ name: file.name, headers: rows[0].map(String), rows: rows.slice(1, 5001) }), { mode: 0o600 });
  return id;
}

export async function loadUpload(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Bad id');
  return JSON.parse(await readFile(path.join(dir(), `${id}.json`), 'utf8')) as { name: string; headers: string[]; rows: string[][] };
}

export function parseCsv(s: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cell = '', q = false;
  const sep = (s.split('\n')[0].match(/;/g)?.length ?? 0) > (s.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

export function guessMapping(headers: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  const norm = (x: string) => x.toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const f of IMPORT_FIELDS) {
    const idx = headers.findIndex((h) => f.guess.some((g) => norm(h) === g)) ;
    const idx2 = idx >= 0 ? idx : headers.findIndex((h) => f.guess.some((g) => g.length > 3 && norm(h).includes(g)));
    if (idx2 >= 0 && !Object.values(m).includes(idx2)) m[f.key] = idx2;
  }
  return m;
}

const STAGE_SYNONYMS: [string, RegExp][] = [
  ['identified', /identif|prospect|lead|new|suspect|محدد/i], ['qualified', /qualif|مؤهل/i], ['engaged', /engag|meeting|discover|تواصل/i],
  ['solutioning', /solution|design|scop/i], ['proposal', /propos|rfp|bid|submitted|quote|عرض/i], ['negotiation', /negot|commit|contract|تفاوض/i],
  ['won', /won|closed won|win|فوز/i], ['lost', /lost|closed lost|خسار/i], ['no_decision', /no decision|abandon|on hold/i],
];
export const toStage = (v: string) => STAGE_SYNONYMS.find(([, re]) => re.test(v))?.[0] ?? null;

export function toDate(v: string): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s); // dd/mm/yyyy (UAE convention)
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if (/^\d{5}$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10); // Excel serial
  const d = new Date(s); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
const toNum = (v: string) => { const n = Number(String(v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : NaN; };
const COUNTRY_NAMES: Record<string, string> = { uae: 'AE', 'united arab emirates': 'AE', emirates: 'AE', ksa: 'SA', 'saudi arabia': 'SA', saudi: 'SA', egypt: 'EG', jordan: 'JO', turkey: 'TR', türkiye: 'TR', qatar: 'QA', kuwait: 'KW', bahrain: 'BH', oman: 'OM' };

export type Validated = { row: number; ok: boolean; errors: string[]; warnings: string[]; value: Record<string, any> };

export function validateRows(rows: string[][], map: Record<string, number>, defaults: { currency: string; country: string }, ownerEmails: Set<string>): Validated[] {
  const get = (r: string[], k: string) => (map[k] != null && map[k] >= 0 ? String(r[map[k]] ?? '').trim() : '');
  return rows.map((r, i) => {
    const errors: string[] = [], warnings: string[] = [];
    const title = get(r, 'title'); if (!title) errors.push('title missing');
    const stageRaw = get(r, 'stage'); const stage = toStage(stageRaw); if (!stage) errors.push(`stage "${stageRaw}" not recognised`);
    const tcv = toNum(get(r, 'tcv')); if (!Number.isFinite(tcv) || tcv < 0) errors.push('value is not a number');
    let currency = get(r, 'currency').toUpperCase() || defaults.currency; if (!(CURRENCIES as readonly string[]).includes(currency)) { warnings.push(`currency ${currency} → ${defaults.currency}`); currency = defaults.currency; }
    let country = get(r, 'country'); country = country.length === 2 ? country.toUpperCase() : COUNTRY_NAMES[country.toLowerCase()] ?? (country ? '' : defaults.country);
    if (!(COUNTRIES as readonly string[]).includes(country)) { warnings.push(`country → ${defaults.country}`); country = defaults.country; }
    let sector = get(r, 'sector').toLowerCase().replace(/\s+/g, '_'); if (!(SECTORS as readonly string[]).includes(sector)) { if (sector) warnings.push(`sector "${sector}" → other`); sector = 'other'; }
    const close = get(r, 'expected_close'); const expected_close = toDate(close); if (close && !expected_close) warnings.push('close date unreadable');
    const owner = get(r, 'owner_email').toLowerCase(); if (owner && !ownerEmails.has(owner)) warnings.push(`owner ${owner} not a Meridian user → you`);
    const prob = get(r, 'probability'); const p = prob ? toNum(prob) : NaN;
    const src = get(r, 'source').toLowerCase();
    return {
      row: i + 2, ok: errors.length === 0, errors, warnings,
      value: {
        title, organisation: get(r, 'organisation') || null, stage, tcv, annual_value: toNum(get(r, 'annual_value')) || tcv, currency, country, sector,
        track: /smb|sme|small/i.test(get(r, 'track')) ? 'smb' : 'enterprise', expected_close, owner_email: ownerEmails.has(owner) ? owner : null,
        probability_override: Number.isFinite(p) ? Math.round(p <= 1 ? p * 100 : p) : null, economic_buyer: get(r, 'economic_buyer') || null, champion: get(r, 'champion') || null,
        compelling_event: get(r, 'compelling_event') || null, next_step: get(r, 'next_step') || null, next_step_date: toDate(get(r, 'next_step_date')),
        last_activity: toDate(get(r, 'last_activity')), source: /meridian/.test(src) ? 'meridian' : /referr/.test(src) ? 'referral' : /inbound|web/.test(src) ? 'inbound' : /event/.test(src) ? 'event' : 'other',
        competitors: get(r, 'competitors').split(/[,;]/).map((x) => x.trim()).filter(Boolean), notes: get(r, 'notes'),
      },
    };
  });
}
