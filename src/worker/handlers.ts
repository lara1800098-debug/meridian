import { sql } from '@/db';
import { crawlSource, ingestUrl } from '@/lib/ingest/sources';
import { rescoreSignal } from '@/lib/ingest/pipeline';
import { generateBriefsDue } from '@/lib/brief';
import { enqueue } from '@/lib/jobs/queue';

export const handlers: Record<string, (p: any) => Promise<unknown>> = {
  crawl_source: (p) => crawlSource(p.sourceId),
  ingest_url: (p) => ingestUrl(p.url, p.userId),
  rescore_all: async () => { const rows = await sql`SELECT id FROM signals WHERE first_seen_at > now() - interval '120 days'`; for (const r of rows) await rescoreSignal(r.id); return rows.length; },
  brief_tick: () => generateBriefsDue(),
};

/** Schedule due sources + brief tick. Called every minute by the worker. */
export async function schedule() {
  const due = await sql`SELECT id FROM sources WHERE enabled AND (last_run_at IS NULL OR last_run_at < now() - make_interval(mins => frequency_min)) ORDER BY priority DESC`;
  for (const s of due) await enqueue('crawl_source', { sourceId: s.id }, { dedupeKey: `src:${s.id}` });
  await enqueue('brief_tick', {}, { dedupeKey: `brief:${new Date().toISOString().slice(0, 13)}` });
}
