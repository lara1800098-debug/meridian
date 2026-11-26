import 'server-only';
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** Copies official logo files from /brand into /public/brand if present. Never generates a logo. */
export function brandLogo(theme: 'light' | 'dark'): string | null {
  const root = process.cwd();
  const pub = path.join(root, 'public', 'brand');
  try {
    const src = path.join(root, 'brand');
    if (existsSync(src)) {
      mkdirSync(pub, { recursive: true });
      for (const f of readdirSync(src)) if (/\.(svg|png)$/i.test(f) && !existsSync(path.join(pub, f))) copyFileSync(path.join(src, f), path.join(pub, f));
    }
  } catch {}
  for (const f of [`concentrix-logo-${theme}.svg`, `concentrix-logo-${theme}.png`]) if (existsSync(path.join(pub, f))) return `/brand/${f}`;
  return null;
}
