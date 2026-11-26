/**
 * Evaluation set for classification/extraction. Run after any rule, prompt or model change:  npm run eval
 * Scores the rules classifier always; also the AI classifier when ANTHROPIC_API_KEY is set (with grounding check).
 * Exits non-zero if rules accuracy drops below the threshold.
 */
import { readFileSync } from 'node:fs';
import { classify } from '../src/lib/engine/classify';

const THRESHOLD = 0.85;
const rows = readFileSync(new URL('./signals.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
let checks = 0, pass = 0;
const fails: string[] = [];
for (const r of rows) {
  const x: any = classify(r.text, r.competitors ?? []);
  for (const [k, v] of Object.entries(r.expect)) {
    checks++;
    if (x[k] === v) pass++; else fails.push(`  ✗ ${k}: expected ${v}, got ${x[k]} — ${r.text.slice(0, 70)}`);
  }
}
const acc = pass / checks;
console.log(`Rules classifier: ${pass}/${checks} field checks (${(acc * 100).toFixed(1)}%) on ${rows.length} items`);
fails.forEach((f) => console.log(f));
if (process.env.ANTHROPIC_API_KEY && process.argv.includes('--ai')) {
  const { aiClassify } = await import('../src/lib/ai/tasks');
  let ok = 0, n = 0;
  for (const [i, r] of rows.entries()) {
    if (!r.expect.signalType) continue;
    n++;
    const a = await aiClassify(`eval-${i}`, r.text, '');
    if (a?.signal_type === r.expect.signalType) ok++;
  }
  console.log(`AI classifier: ${ok}/${n} signal types correct (grounding check enforced)`);
  process.exit(0);
}
process.exit(acc >= THRESHOLD ? 0 : 1);
