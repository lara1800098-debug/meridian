import type { Lang } from '@/i18n';

export type Fx = Record<string, number>; // per 1 USD

export function toUsd(amount: number, currency: string, fx: Fx) { return amount / (fx[currency] ?? 1); }
export function fromUsd(usd: number, currency: string, fx: Fx) { return usd * (fx[currency] ?? 1); }

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-AE' : 'en-AE');

/** Compact executive money: AED 12.4M. Uses Latin digits in Arabic UI too (common in Gulf business), configurable later. */
export function money(usd: number | null | undefined, currency: string, fx: Fx, lang: Lang = 'en', compact = true) {
  if (usd == null || Number.isNaN(usd)) return '—';
  const v = fromUsd(Number(usd), currency, fx);
  const n = new Intl.NumberFormat(lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-AE', {
    notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 0,
  }).format(v);
  return `${currency} ${n}`;
}
export const num = (n: number, lang: Lang = 'en', digits = 0) =>
  new Intl.NumberFormat(lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-AE', { maximumFractionDigits: digits }).format(n);
export const pct = (n: number, lang: Lang = 'en') => `${num(Math.round(n * 100), lang)}%`;

export function date(d: Date | string | null | undefined, lang: Lang = 'en', tz = 'Asia/Dubai', hijri = false) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const g = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz }).format(dt);
  if (!hijri) return g;
  const h = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-u-ca-islamic-umalqura', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz }).format(dt);
  return `${g} · ${h}`;
}
export const daysBetween = (a: Date | string, b: Date | string = new Date()) =>
  Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

export function quarterOf(d: Date = new Date()) { return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`; }
export function quarterRange(q: string) {
  const [y, qq] = q.split('-Q').map(Number);
  const start = new Date(Date.UTC(y, (qq - 1) * 3, 1));
  const end = new Date(Date.UTC(y, qq * 3, 0, 23, 59, 59));
  return { start, end };
}
export function nextQuarter(q: string) { const [y, qq] = q.split('-Q').map(Number); return qq === 4 ? `${y + 1}-Q1` : `${y}-Q${qq + 1}`; }
