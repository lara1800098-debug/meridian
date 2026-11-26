/** Retention: delete crawled snapshots/signals (and orphaned people) older than N days that are not linked to a deal or accepted play. Usage: npm run retention -- --days 730 */
import { sql } from '../src/db';
const i = process.argv.indexOf('--days'); const days = Number(i > 0 ? process.argv[i + 1] : 730);
const s = await sql`DELETE FROM signals s WHERE s.first_seen_at < now() - make_interval(days => ${days}) AND NOT s.is_demo
  AND NOT EXISTS (SELECT 1 FROM deal_signals ds WHERE ds.signal_id = s.id) AND NOT EXISTS (SELECT 1 FROM plays p WHERE p.signal_id = s.id AND p.status = 'accepted') RETURNING id`;
const sn = await sql`DELETE FROM snapshots sn WHERE sn.fetched_at < now() - make_interval(days => ${days}) AND NOT sn.is_demo AND NOT EXISTS (SELECT 1 FROM signal_sources ss WHERE ss.snapshot_id = sn.id) RETURNING id`;
const p = await sql`DELETE FROM people WHERE seen_at < now() - make_interval(days => ${days}) AND NOT is_demo RETURNING id`;
await sql`INSERT INTO audit_log (action, meta) VALUES ('retention.run', ${sql.json({ days, signals: s.length, snapshots: sn.length, people: p.length })})`;
console.log(`✔ retention ${days}d: ${s.length} signals, ${sn.length} snapshots, ${p.length} people removed`);
await sql.end();
