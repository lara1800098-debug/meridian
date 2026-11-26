import { createHash } from 'node:crypto';

const STOP = new Set('the a an of to in on for and with by at from as is are was be its new says said will has have over after into uae dubai abu dhabi في من على إلى عن مع أن التي الذي هذا هذه'.split(' '));

export function normalizeTitle(t: string) {
  return t.toLowerCase()
    .replace(/[ً-ْ]/g, '') // Arabic diacritics
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/\s[-–|]\s[^-–|]{2,40}$/, '') // trailing " - Outlet Name"
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).join(' ');
}

export const contentHash = (url: string, title: string) => createHash('sha256').update(url.split('#')[0] + '|' + normalizeTitle(title)).digest('hex');

/** Stable fingerprint for "same story": sorted significant tokens. */
export function fingerprint(title: string) {
  const toks = [...new Set(normalizeTitle(title).split(' '))].sort();
  return createHash('sha1').update(toks.join(' ')).digest('hex').slice(0, 16);
}

function trigrams(s: string) {
  const x = `  ${s} `; const g = new Set<string>();
  for (let i = 0; i < x.length - 2; i++) g.add(x.slice(i, i + 3));
  return g;
}
/** Jaccard similarity of character trigrams on normalised titles (0..1). Mirrors pg_trgm similarity(). */
export function similarity(a: string, b: string) {
  const A = trigrams(normalizeTitle(a)), B = trigrams(normalizeTitle(b));
  let inter = 0; for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter || 1);
}
export const SAME_STORY = 0.55;
