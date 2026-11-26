import { sql } from '@/db';
import { getSettings } from '../settings';
import { parseFeed, parseHtmlPage, politeFetch, RobotsDenied } from './crawler';
import { ingestItem } from './pipeline';

export async function crawlSource(sourceId: string) {
  const [src] = await sql`SELECT * FROM sources WHERE id = ${sourceId}`;
  if (!src) return { found: 0, created: 0 };
  const s = await getSettings();
  await sql`UPDATE sources SET last_run_at = now(), run_count = run_count + 1 WHERE id = ${sourceId}`;
  try {
    const { text } = await politeFetch(src.url, { delayMs: s.crawler.perDomainDelayMs, timeoutMs: s.crawler.timeoutMs });
    let items: { url: string; title: string; excerpt: string; publishedAt: Date | null; outlet: string | null; body?: string }[] = [];
    if (src.type === 'rss' || src.type === 'search' || src.type === 'sitemap') items = parseFeed(text);
    else { const p = parseHtmlPage(text, src.url); items = [{ url: src.url, title: p.title, excerpt: p.excerpt, publishedAt: p.publishedAt, outlet: src.name, body: p.body }]; }
    items = items.slice(0, s.crawler.maxItemsPerRun);
    let created = 0;
    for (const it of items) {
      const r = await ingestItem({ sourceId, url: it.url, title: it.title, excerpt: it.excerpt, body: it.body ?? null, publishedAt: it.publishedAt, outlet: it.outlet, origin: 'crawl', storeBody: src.store_full_text });
      if (r.status === 'new') created++;
    }
    await sql`UPDATE sources SET last_success_at = now(), last_error = NULL, items_found = items_found + ${items.length} WHERE id = ${sourceId}`;
    return { found: items.length, created };
  } catch (e: any) {
    const msg = e instanceof RobotsDenied ? `robots.txt: ${e.message}` : String(e?.message ?? e);
    await sql`UPDATE sources SET last_error = ${msg.slice(0, 300)}, error_count = error_count + 1 WHERE id = ${sourceId}`;
    if (e instanceof RobotsDenied) { await sql`UPDATE sources SET enabled = false, notes = notes || ' [auto-disabled: robots.txt disallows]' WHERE id = ${sourceId}`; return { found: 0, created: 0 }; }
    throw e;
  }
}

export async function ingestUrl(url: string, userId: string) {
  const s = await getSettings();
  const { text, finalUrl } = await politeFetch(url, { delayMs: 1000, timeoutMs: s.crawler.timeoutMs });
  const p = parseHtmlPage(text, finalUrl);
  return ingestItem({ sourceId: null, url: finalUrl, title: p.title, excerpt: p.excerpt, body: p.body, publishedAt: p.publishedAt, origin: 'manual_url', addedBy: userId, storeBody: isOfficial(finalUrl) });
}

/** Full text is kept only for official/government sources; news sites keep headline + excerpt + link (copyright). */
export const isOfficial = (u: string) => /(\.gov\.[a-z]{2}|\.gov$|(^|\.)wam\.ae|mediaoffice\.ae|mediaoffice\.abudhabi|(^|\.)u\.ae|spa\.gov\.sa)/i.test(new URL(u).hostname);
