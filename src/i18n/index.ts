import en, { type Dict } from './en';
import ar from './ar';

export type Lang = 'en' | 'ar';
const dicts = { en, ar } as Record<Lang, Dict>;

type Path<T, P extends string = ''> = { [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Path<T[K], `${P}${K}.`> }[keyof T & string];
export type TKey = Path<Dict>;

export function translator(lang: Lang) {
  const d = dicts[lang] ?? en;
  return function t(key: TKey | string, vars?: Record<string, string | number>): string {
    let v: any = d;
    for (const p of key.split('.')) v = v?.[p];
    if (typeof v !== 'string') { v = en as any; for (const p of key.split('.')) v = v?.[p]; }
    let s = typeof v === 'string' ? v : key;
    if (vars) for (const [k, val] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(val));
    return s;
  };
}
export type T = ReturnType<typeof translator>;
export const dir = (lang: Lang) => (lang === 'ar' ? 'rtl' : 'ltr');
