/** Probe candidate feeds: reachability, robots.txt permission and item count. Usage: npx tsx scripts/probe-feeds.ts <url>... */
import { parseFeed, politeFetch, RobotsDenied } from '../src/lib/ingest/crawler';
for (const u of process.argv.slice(2)) {
  try { const r = await politeFetch(u, { delayMs: 200, timeoutMs: 15000 }); const items = parseFeed(r.text); console.log(`OK  ${items.length.toString().padStart(3)}  ${u}  ${items[0]?.title?.slice(0, 60) ?? ''}`); }
  catch (e: any) { console.log(`${e instanceof RobotsDenied ? 'ROB' : 'ERR'}  ${String(e.message).slice(0, 40).padEnd(40)} ${u}`); }
}
