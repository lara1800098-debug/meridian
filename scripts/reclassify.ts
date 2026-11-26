/** Re-apply the current rules to stored (non-demo, rules-classified) signals after a rule change: drop non-signals, fix types, rescore. */
import { sql } from '../src/db';
import { classify } from '../src/lib/engine/classify';
import { rescoreSignal } from '../src/lib/ingest/pipeline';
import { SIGNAL_TYPES } from '../src/lib/taxonomy';
const comps = (await sql`SELECT name, aliases FROM competitors`).flatMap((c) => [c.name, ...c.aliases]);
let dropped = 0, changed = 0;
for (const s of await sql`SELECT id, title, summary, signal_type, track FROM signals WHERE NOT is_demo AND classification_method = 'rules'`) {
  const x = classify(`${s.title}\n${s.summary}`, comps);
  if (!x.relevant) { await sql`DELETE FROM signals WHERE id = ${s.id}`; dropped++; continue; }
  if (x.signalType !== s.signal_type && s.signal_type !== 'competitor_award') {
    const track = SIGNAL_TYPES[x.signalType] === 'against' ? 'against' : x.signalType === 'competitor_move' ? 'competitor' : x.track;
    await sql`UPDATE signals SET signal_type = ${x.signalType}, track = ${track} WHERE id = ${s.id}`;
    await sql`DELETE FROM plays WHERE signal_id = ${s.id} AND status = 'new'`;
    changed++;
  }
  await rescoreSignal(s.id);
}
await sql`INSERT INTO audit_log (action, meta) VALUES ('signals.reclassify', ${sql.json({ dropped, changed })})`;
console.log(`✔ reclassified: ${dropped} dropped as non-signals, ${changed} re-typed`);
await sql.end();
