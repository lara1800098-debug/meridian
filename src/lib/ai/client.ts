/**
 * LLM abstraction. Default provider: Anthropic Claude. Model is configurable per task (Admin → AI).
 * Cost controls: daily USD budget, response cache, usage log. If no key / budget hit / AI disabled → returns null
 * and callers fall back to rules/templates (the app is fully usable without AI).
 */
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { sql } from '@/db';
import { getSettings } from '../settings';
import { prompt } from './prompts';

// USD per 1M tokens (input, output) — from Anthropic pricing, update in one place.
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5], 'claude-fable-5-2': [8, 40],
};

let client: Anthropic | null = null;
export const aiAvailable = () => !!process.env.ANTHROPIC_API_KEY;
function getClient() { if (!client) client = new Anthropic(); return client; }

export async function spentTodayUsd() {
  const [r] = await sql`SELECT coalesce(sum(cost_usd),0)::float AS s FROM ai_usage WHERE at >= date_trunc('day', now())`;
  return r.s as number;
}

type Opts = { task: string; system?: string; user: string; schema: Record<string, unknown>; maxTokens?: number; effort?: 'low' | 'medium' | 'high' };

export async function aiJson<T>(o: Opts): Promise<{ data: T; model: string } | null> {
  if (!aiAvailable()) return null;
  const s = await getSettings();
  if (!s.aiEnabled) return null;
  const model = s.models[o.task] ?? 'claude-opus-5-5';
  const system = o.system ?? prompt('_system_guardrails').text;
  const key = createHash('sha256').update(JSON.stringify([model, system, o.user, o.schema])).digest('hex');
  const [hit] = await sql`SELECT value FROM ai_cache WHERE key = ${key} AND created_at > now() - interval '30 days'`;
  if (hit) {
    await sql`INSERT INTO ai_usage (task, model, cached) VALUES (${o.task}, ${model}, true)`;
    return { data: hit.value as T, model };
  }
  if ((await spentTodayUsd()) >= s.aiDailyBudgetUsd) {
    await sql`INSERT INTO ai_usage (task, model, ok, error) VALUES (${o.task}, ${model}, false, 'daily budget reached')`;
    return null;
  }
  try {
    const res: any = await (getClient().beta.messages.create as any)({
      model,
      max_tokens: o.maxTokens ?? 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: o.user }],
      output_config: { effort: o.effort ?? 'low', format: { type: 'json_schema', schema: o.schema } },
    });
    const u = res.usage ?? {};
    const [pi, po] = PRICES[model] ?? [4, 20];
    const cost = ((u.input_tokens ?? 0) * pi + (u.output_tokens ?? 0) * po) / 1e6;
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      await sql`INSERT INTO ai_usage (task, model, input_tokens, output_tokens, cost_usd, ok, error) VALUES (${o.task}, ${model}, ${u.input_tokens ?? 0}, ${u.output_tokens ?? 0}, ${cost}, false, ${res.stop_reason})`;
      return null;
    }
    const text = (res.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const data = JSON.parse(text) as T;
    await sql`INSERT INTO ai_usage (task, model, input_tokens, output_tokens, cost_usd) VALUES (${o.task}, ${model}, ${u.input_tokens ?? 0}, ${u.output_tokens ?? 0}, ${cost})`;
    await sql`INSERT INTO ai_cache (key, value) VALUES (${key}, ${sql.json(data as any)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, created_at = now()`;
    return { data, model };
  } catch (e: any) {
    await sql`INSERT INTO ai_usage (task, model, ok, error) VALUES (${o.task}, ${model}, false, ${String(e?.message ?? e).slice(0, 300)})`;
    return null;
  }
}
