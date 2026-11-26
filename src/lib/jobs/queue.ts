/** Minimal Postgres job queue (FOR UPDATE SKIP LOCKED): retries with exponential backoff, dead-letter after max attempts. */
import { sql } from '@/db';

export async function enqueue(type: string, payload: Record<string, unknown> = {}, opts: { runAt?: Date; maxAttempts?: number; dedupeKey?: string } = {}) {
  if (opts.dedupeKey) {
    const [x] = await sql`SELECT id FROM jobs WHERE type = ${type} AND status IN ('queued','running') AND payload->>'_key' = ${opts.dedupeKey}`;
    if (x) return x.id;
  }
  const [j] = await sql`INSERT INTO jobs (type, payload, run_at, max_attempts) VALUES (${type}, ${sql.json({ ...payload, _key: opts.dedupeKey ?? null } as any)}, ${opts.runAt ?? new Date()}, ${opts.maxAttempts ?? 4}) RETURNING id`;
  return j.id;
}

export async function pick() {
  const [j] = await sql`
    UPDATE jobs SET status = 'running', attempts = attempts + 1
    WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_at <= now() ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING *`;
  return j ?? null;
}

export async function complete(id: number) { await sql`UPDATE jobs SET status = 'done', finished_at = now(), last_error = NULL WHERE id = ${id}`; }

export async function fail(job: { id: number; attempts: number; max_attempts: number }, err: unknown) {
  const msg = String((err as any)?.message ?? err).slice(0, 500);
  if (job.attempts >= job.max_attempts) await sql`UPDATE jobs SET status = 'dead', last_error = ${msg}, finished_at = now() WHERE id = ${job.id}`;
  else await sql`UPDATE jobs SET status = 'queued', last_error = ${msg}, run_at = now() + make_interval(secs => ${30 * 2 ** job.attempts}) WHERE id = ${job.id}`;
}

/** Recover jobs stuck in 'running' (worker crashed). */
export async function reapStale() { await sql`UPDATE jobs SET status = 'queued' WHERE status = 'running' AND created_at < now() - interval '30 minutes' AND finished_at IS NULL AND run_at < now() - interval '15 minutes'`; }
