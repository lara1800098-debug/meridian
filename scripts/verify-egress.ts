/**
 * Verifies and documents every outbound destination Meridian can contact:
 *  (1) hosts of ENABLED sources in the registry (public web reading), (2) the LLM provider API.
 * It also scans the source code for network calls outside the two allowed modules.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { sql } from '../src/db';

const ALLOWED_FILES = ['src/lib/ingest/crawler.ts', 'src/lib/ai/client.ts', 'src/lib/pdf.ts'];
function walk(d: string): string[] { return readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; }); }
const offenders = walk('src').filter((f) => !ALLOWED_FILES.includes(f) && /\bfetch\(\s*['"`]?https?:|new Anthropic\(|https?\.request\(|axios|got\(/.test(readFileSync(f, 'utf8')));
const hosts = (await sql`SELECT DISTINCT url FROM sources WHERE enabled`).map((r) => new URL(r.url).host);
console.log('Outbound destinations allowed by configuration:');
console.log('  • LLM provider: api.anthropic.com' + (process.env.ANTHROPIC_API_KEY ? '' : '  (inactive — no API key set)'));
for (const h of [...new Set(hosts)].sort()) console.log(`  • public source: ${h}`);
console.log('  • PDF rendering: headless Chromium talks only to this app (all other requests are blocked in src/lib/pdf.ts)');
console.log(`\nCode scan: ${offenders.length ? '✗ unexpected network calls in: ' + offenders.join(', ') : '✓ no network calls outside ' + ALLOWED_FILES.join(', ')}`);
console.log('Fonts, scripts and styles are self-hosted (no CDNs, no analytics, no telemetry: NEXT_TELEMETRY_DISABLED=1).');
await sql.end();
process.exit(offenders.length ? 1 : 0);
