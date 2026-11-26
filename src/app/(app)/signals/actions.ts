'use server';
import { redirect, unstable_rethrow } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sql } from '@/db';
import { requireUser } from '@/lib/auth';
import { assertCan } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { rateLimit } from '@/lib/ratelimit';
import { ingestUrl } from '@/lib/ingest/sources';
import { ingestItem } from '@/lib/ingest/pipeline';
import { storeAndExtract } from '@/lib/ingest/documents';
import { enqueue } from '@/lib/jobs/queue';
import { aiTranslate } from '@/lib/ai/tasks';

export async function addSignal(_: unknown, fd: FormData) {
  const u = await requireUser();
  assertCan(u, 'signals.add');
  if (!(await rateLimit(`addsig:${u.id}`, 30, 3600))) return { error: 'Rate limit — try later.' };
  const url = String(fd.get('url') ?? '').trim();
  const file = fd.get('file') as File | null;
  try {
    let r;
    if (file && file.size > 0) {
      const doc = await storeAndExtract(file);
      if (!doc.text) return { error: 'Could not read text from this file.' };
      const lines = doc.text.split('\n').map((l) => l.trim()).filter(Boolean);
      r = await ingestItem({ sourceId: null, url: `upload://${file.name}`, title: (lines[0] ?? file.name).slice(0, 300), excerpt: lines.slice(1).join(' ').slice(0, 1000), body: doc.text.slice(0, 50000), publishedAt: new Date(), origin: 'upload', addedBy: u.id, storeBody: true });
      await audit(u.id, 'signal.upload', 'snapshot', undefined, { file: file.name });
    } else if (/^https?:\/\//i.test(url)) {
      r = await ingestUrl(url, u.id);
      await audit(u.id, 'signal.url', 'snapshot', undefined, { url });
    } else return { error: 'Paste a public http(s) URL or choose a file.' };
    if (r.signalId) redirect(`/signals/${r.signalId}`);
    return { error: 'Already in Meridian (same source already stored).' };
  } catch (e: any) {
    unstable_rethrow(e);
    return { error: String(e?.message ?? e) };
  }
}

export async function runIngestion() {
  const u = await requireUser();
  assertCan(u, 'admin');
  const srcs = await sql`SELECT id FROM sources WHERE enabled`;
  for (const s of srcs) await enqueue('crawl_source', { sourceId: s.id }, { dedupeKey: `src:${s.id}` });
  await audit(u.id, 'ingest.run_all', 'sources', undefined, { n: srcs.length });
  revalidatePath('/signals');
}

export async function translateSnapshot(id: string, signalId: string) {
  const u = await requireUser();
  const [s] = await sql`SELECT * FROM snapshots WHERE id = ${id}`;
  if (!s) return;
  const tr = await aiTranslate(s.id, s.title, s.excerpt, s.lang === 'ar' ? 'English' : 'Arabic');
  if (tr) await sql`UPDATE snapshots SET title_translated = ${tr.title}, excerpt_translated = ${tr.excerpt} WHERE id = ${id}`;
  await audit(u.id, 'snapshot.translate', 'snapshot', id, { ok: !!tr });
  revalidatePath(`/signals/${signalId}`);
}
