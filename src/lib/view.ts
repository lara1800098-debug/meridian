import type { T } from '@/i18n';
import type { Reason } from './engine/health';

export function reasonText(r: Reason, t: T, lang: 'en' | 'ar', stageName: (k: string) => string) {
  const p: Record<string, string | number> = { ...r.params };
  if (r.code === 'criteria') p.list = String(r.params.list).split(',').map((c) => t(`criteria.${c}`)).join(lang === 'ar' ? '، ' : ', ');
  if (r.code === 'stuck') p.stage = stageName(String(r.params.stage));
  return t(`health.${r.code}`, p);
}
export const pick = <T,>(lang: 'en' | 'ar', en: T, ar: T | null | undefined) => (lang === 'ar' ? ar ?? en : en);
export const sp = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
