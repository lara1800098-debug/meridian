/** Crawl all enabled sources once and process every queued job, then exit. Used for first runs, demos and CI. */
import { sql } from '@/db';
import { enqueue, pick, complete, fail } from '@/lib/jobs/queue';
import { handlers } from './handlers';

async function main() {
  const srcs = await sql`SELECT id, name FROM sources WHERE enabled`;
  for (const s of srcs) await enqueue('crawl_source', { sourceId: s.id }, { dedupeKey: `src:${s.id}`, maxAttempts: 1 });
  console.log(`Queued ${srcs.length} enabled sources`);
  for (let job = await pick(); job; job = await pick()) {
    try { const r = await handlers[job.type](job.payload); await complete(job.id); console.log(`✔ ${job.type}`, JSON.stringify(r)); }
    catch (e: any) { console.log(`✘ ${job.type}: ${e.message}`); await fail(job as any, e); }
  }
  const rows = await sql`SELECT name, last_success_at IS NOT NULL AS ok, items_found, last_error FROM sources WHERE enabled OR last_error IS NOT NULL ORDER BY name`;
  console.table(rows);
  await sql.end();
}
main();
