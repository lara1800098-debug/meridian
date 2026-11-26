'use server';
import { redirect } from 'next/navigation';
import { sql } from '@/db';
import { requireUser } from '@/lib/auth';
import { assertCan } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { IMPORT_FIELDS, loadUpload, parseUpload, validateRows } from '@/lib/import';

export async function uploadImport(fd: FormData) {
  const u = await requireUser();
  assertCan(u, 'deals.edit');
  const f = fd.get('file') as File;
  if (!f || !f.size) throw new Error('Choose a file');
  const id = await parseUpload(f);
  await audit(u.id, 'import.upload', 'deals', id, { file: f.name });
  redirect(`/deals/import?f=${id}`);
}

export async function commitImport(fd: FormData) {
  const u = await requireUser();
  assertCan(u, 'deals.edit');
  const id = String(fd.get('f'));
  const up = await loadUpload(id);
  const map = Object.fromEntries(IMPORT_FIELDS.map((x) => [x.key, Number(fd.get(`m_${x.key}`) ?? -1)]));
  const owners = await sql`SELECT id, lower(email) AS email FROM users WHERE active`;
  const byEmail = new Map(owners.map((o) => [o.email, o.id]));
  const rows = validateRows(up.rows, map, { currency: u.currency, country: u.countries[0] ?? 'AE' }, new Set(byEmail.keys())).filter((r) => r.ok);
  let n = 0, skipped = 0;
  for (const { value: v } of rows) {
    const [dup] = await sql`SELECT 1 FROM deals WHERE lower(title) = lower(${v.title}) AND status = 'open'`;
    if (dup) { skipped++; continue; } // re-importing the same file must not duplicate deals
    let orgId: string | null = null;
    if (v.organisation) {
      const [o] = await sql`SELECT id FROM organisations WHERE lower(name_en) = lower(${v.organisation}) OR similarity(name_en, ${v.organisation}) > 0.75 ORDER BY similarity(name_en, ${v.organisation}) DESC LIMIT 1`;
      orgId = o?.id ?? (await sql`INSERT INTO organisations (name_en, sector, country) VALUES (${v.organisation}, ${v.sector}, ${v.country}) RETURNING id`)[0].id;
    }
    const closed = ['won', 'lost', 'no_decision'].includes(v.stage);
    const last = v.last_activity ? new Date(v.last_activity) : new Date();
    const [d] = await sql`INSERT INTO deals (org_id, title, track, country, sector, tcv, annual_value, currency, stage, probability_override, expected_close, owner_id, source,
        economic_buyer, champion, compelling_event, next_step, next_step_date, competitors, notes, status, closed_at, final_value, created_by, last_activity_at, stage_entered_at)
      VALUES (${orgId}, ${v.title}, ${v.track}, ${v.country}, ${v.sector}, ${v.tcv}, ${v.annual_value}, ${v.currency}, ${v.stage}, ${v.probability_override}, ${v.expected_close},
        ${v.owner_email ? byEmail.get(v.owner_email) : u.id}, ${v.source}, ${v.economic_buyer}, ${v.champion}, ${v.compelling_event}, ${v.next_step}, ${v.next_step_date},
        ${v.competitors}, ${v.notes}, ${closed ? v.stage : 'open'}, ${closed ? last : null}, ${v.stage === 'won' ? v.tcv : null}, ${u.id}, ${last}, ${last})
      RETURNING id`;
    await sql`INSERT INTO deal_history (deal_id, user_id, field, new_value, note) VALUES (${d.id}, ${u.id}, 'stage', ${v.stage}, ${`Imported from ${up.name}`})`;
    n++;
  }
  await audit(u.id, 'import.commit', 'deals', id, { imported: n, skipped });
  redirect(`/deals?imported=${n}&skipped=${skipped}`);
}
