'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sql } from '@/db';
import { requireUser } from '@/lib/auth';
import { assertCan } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { storeAndExtract } from '@/lib/ingest/documents';
import { extractTender, parseLooseDate } from '@/lib/engine/tender';
import { aiTender } from '@/lib/ai/tasks';
import { isArabic } from '@/lib/engine/classify';

export async function uploadTender(fd: FormData) {
  const u = await requireUser();
  assertCan(u, 'tenders');
  const f = fd.get('file') as File;
  if (!f?.size) throw new Error('Choose a file');
  const doc = await storeAndExtract(f);
  let fields = extractTender(doc.text);
  let method = 'rules';
  const [row] = await sql`INSERT INTO tenders (filename, stored_path, text, lang, extracted, uploaded_by) VALUES (${f.name}, ${doc.stored}, ${doc.text.slice(0, 400000)}, ${isArabic(doc.text.slice(0, 3000)) ? 'ar' : 'en'}, ${sql.json({ fields, scanned: doc.scanned } as any)}, ${u.id}) RETURNING id`;
  if (doc.text.length > 200) {
    const ai = await aiTender(row.id, f.name, doc.text);
    if (ai) { for (const [k, v] of Object.entries(ai)) if (v.value && v.quote) fields[k] = v; method = 'ai+rules'; }
  }
  await sql`UPDATE tenders SET extracted = ${sql.json({ fields, scanned: doc.scanned } as any)}, method = ${method} WHERE id = ${row.id}`;
  await audit(u.id, 'tender.upload', 'tender', row.id, { file: f.name });
  redirect(`/tenders/${row.id}`);
}

export async function decideTender(id: string, fd: FormData) {
  const u = await requireUser();
  assertCan(u, 'tenders');
  const decision = String(fd.get('decision'));
  if (!['go', 'nogo', 'review'].includes(decision)) throw new Error('Bad decision');
  await sql`UPDATE tenders SET decision = ${decision} WHERE id = ${id}`;
  await audit(u.id, 'tender.decision', 'tender', id, { decision });
  revalidatePath(`/tenders/${id}`);
}

export async function attachTender(id: string, fd: FormData) {
  const u = await requireUser();
  assertCan(u, 'deals.edit');
  const [t] = await sql`SELECT * FROM tenders WHERE id = ${id}`;
  let dealId = String(fd.get('deal') ?? '');
  const f = t.extracted.fields ?? {};
  if (!dealId) {
    const title = `Tender: ${(f.issuer?.value ?? t.filename).slice(0, 120)}`;
    const [d] = await sql`INSERT INTO deals (title, stage, owner_id, created_by, source, scope_recorded, compelling_event) VALUES (${title}, 'qualified', ${u.id}, ${u.id}, 'other', true, 'Published tender') RETURNING id`;
    dealId = d.id;
    await sql`INSERT INTO deal_history (deal_id, user_id, field, new_value, note) VALUES (${dealId}, ${u.id}, 'stage', 'qualified', 'Created from Tender Reader')`;
  }
  const sub = parseLooseDate(f.submission_deadline?.value), clar = parseLooseDate(f.clarification_deadline?.value);
  if (clar) await sql`INSERT INTO deal_history (deal_id, user_id, field, new_value, note) VALUES (${dealId}, ${u.id}, 'milestone', ${clar.toISOString().slice(0, 10)}, 'Clarification deadline (from tender)')`;
  if (sub) {
    await sql`INSERT INTO deal_history (deal_id, user_id, field, new_value, note) VALUES (${dealId}, ${u.id}, 'milestone', ${sub.toISOString().slice(0, 10)}, 'Submission deadline (from tender)')`;
    await sql`UPDATE deals SET next_step = coalesce(next_step, 'Submit tender response'), next_step_date = coalesce(next_step_date, ${sub.toISOString().slice(0, 10)}), decision_date = coalesce(decision_date, ${sub.toISOString().slice(0, 10)}), scope_recorded = true WHERE id = ${dealId}`;
  }
  await sql`UPDATE tenders SET deal_id = ${dealId} WHERE id = ${id}`;
  await audit(u.id, 'tender.attach', 'tender', id, { dealId });
  redirect(`/deals/${dealId}`);
}
