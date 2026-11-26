import { readFileSync } from 'node:fs';
import path from 'node:path';
/** Prompts are versioned files in /prompts (name.vN.md). Bump the version when changing wording; the eval set checks regressions. */
const cache = new Map<string, string>();
export function prompt(name: string, vars: Record<string, string> = {}, version = 'v1') {
  const key = `${name}.${version}`;
  if (!cache.has(key)) cache.set(key, readFileSync(path.join(process.cwd(), 'prompts', `${key}.md`), 'utf8'));
  let s = cache.get(key)!;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{{${k}}}`, v);
  return { text: s, id: key };
}
/** Wrap crawled text so the model treats it as data, never instructions. Strips any attempt to close the tag. */
export function sourceDoc(id: string, title: string, body: string) {
  const clean = (s: string) => s.replace(/<\/?source_document[^>]*>/gi, '').slice(0, 12000);
  return `<source_document id="${id}" title="${clean(title).replace(/"/g, "'")}">\n${clean(body)}\n</source_document>`;
}
