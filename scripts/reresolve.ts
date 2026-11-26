/** Re-derive each live signal's organisation ("logo") from its headline and refresh the international flag. Run after extraction rules change. */
import { sql } from '../src/db';
import { classify, headlineSubject } from '../src/lib/engine/classify';
import { resolveOrg, rescoreSignal } from '../src/lib/ingest/pipeline';
let n = 0;
for (const s of await sql`SELECT id, title, summary, org_id, extracted FROM signals WHERE NOT is_demo`) {
  const ex = classify(`${s.title}\n${s.summary}`, []);
  const subj = headlineSubject(s.title);
  const orgId = subj ? await resolveOrg(subj, null, ex) : null;
  await sql`UPDATE signals SET org_id = ${orgId}, extracted = extracted || ${sql.json({ international: ex.international, subject: subj })} WHERE id = ${s.id}`;
  await sql`UPDATE plays SET org_id = ${orgId} WHERE signal_id = ${s.id}`;
  await rescoreSignal(s.id);
  n++;
}
await sql`DELETE FROM organisations o WHERE NOT o.is_demo AND NOT EXISTS (SELECT 1 FROM signals WHERE org_id = o.id) AND NOT EXISTS (SELECT 1 FROM deals WHERE org_id = o.id) AND NOT EXISTS (SELECT 1 FROM relationships WHERE org_id = o.id) AND NOT EXISTS (SELECT 1 FROM plays WHERE org_id = o.id)`;
console.log(`✔ re-resolved ${n} signals`);
await sql.end();
