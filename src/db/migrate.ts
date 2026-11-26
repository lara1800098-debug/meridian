import { readFileSync } from 'node:fs';
import { sql } from './index';
import { ensureDefaults } from './defaults';

async function main() {
  const ddl = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  await sql.unsafe(ddl);
  await ensureDefaults();
  console.log('✔ schema applied and defaults ensured');
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
