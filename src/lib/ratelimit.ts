import { sql } from '@/db';
/** Fixed-window limiter stored in Postgres (no extra infra). Returns true if allowed. */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const [r] = await sql`
    INSERT INTO rate_limits (key, count, window_start) VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN now() ELSE rate_limits.window_start END
    RETURNING count`;
  return r.count <= limit;
}
