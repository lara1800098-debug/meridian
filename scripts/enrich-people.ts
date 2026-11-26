/**
 * Points of contact from the news: for each open opportunity, read its source article (robots.txt respected, polite rate)
 * and record people named with a business title — name, title, organisation and the article link only.
 * No personal contact details are collected or stored (UAE PDPL / KSA PDPL). Usage: npm run enrich:people
 */
import { sql } from '../src/db';
import { politeFetch, parseHtmlPage } from '../src/lib/ingest/crawler';
import { extractPeople } from '../src/lib/engine/people';

const rows = await sql`
  SELECT DISTINCT ON (sn.url) s.org_id, sn.url, sn.title
  FROM plays p JOIN signals s ON s.id = p.signal_id JOIN signal_sources ss ON ss.signal_id = s.id JOIN snapshots sn ON sn.id = ss.snapshot_id
  WHERE NOT s.is_demo AND p.status = 'new' AND s.org_id IS NOT NULL AND sn.url LIKE 'https://%'
    AND NOT EXISTS (SELECT 1 FROM people pe WHERE pe.source_url = sn.url)
  LIMIT 60`;
let pages = 0, found = 0;
for (const r of rows) {
  try {
    const { text, finalUrl } = await politeFetch(r.url, { delayMs: 3000, timeoutMs: 20000 });
    const page = parseHtmlPage(text, finalUrl);
    pages++;
    for (const p of extractPeople(`${page.title}. ${page.body}`)) {
      await sql`INSERT INTO people (name, title, org_id, source_url) SELECT ${p.name}, ${p.title}, ${r.org_id}, ${r.url}
        WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(name) = lower(${p.name}) AND org_id = ${r.org_id})`;
      found++;
    }
  } catch (e: any) { console.log(`skip ${r.url}: ${String(e.message).slice(0, 80)}`); }
}
console.log(`✔ people: read ${pages} articles, found ${found} named contacts`);
await sql.end();
