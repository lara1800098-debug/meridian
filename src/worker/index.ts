/** Background worker: scheduler + job runner. Run with `npm run worker` (separate process / container). */
import { complete, fail, pick, reapStale } from '@/lib/jobs/queue';
import { handlers, schedule } from './handlers';

let stopping = false;
process.on('SIGTERM', () => (stopping = true));
process.on('SIGINT', () => (stopping = true));

async function loop() {
  let lastSchedule = 0;
  console.log('[worker] started');
  while (!stopping) {
    if (Date.now() - lastSchedule > 60_000) { try { await schedule(); await reapStale(); } catch (e) { console.error('[worker] schedule error', e); } lastSchedule = Date.now(); }
    const job = await pick().catch((e) => { console.error(e); return null; });
    if (!job) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    const h = handlers[job.type];
    try {
      if (!h) throw new Error(`No handler for ${job.type}`);
      const res = await h(job.payload);
      await complete(job.id);
      console.log(`[worker] ${job.type} #${job.id} done`, typeof res === 'object' ? JSON.stringify(res) : res ?? '');
    } catch (e) {
      console.error(`[worker] ${job.type} #${job.id} failed`, (e as Error).message);
      await fail(job as any, e);
    }
  }
  console.log('[worker] stopped');
  process.exit(0);
}
loop();
