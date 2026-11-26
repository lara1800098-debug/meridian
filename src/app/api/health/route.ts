import { sql } from '@/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const [r] = await sql`SELECT (SELECT count(*) FROM jobs WHERE status = 'dead')::int AS dead, (SELECT max(finished_at) FROM jobs WHERE status = 'done') AS last_job`;
    return Response.json({ ok: true, db: 'up', deadJobs: r.dead, lastJob: r.last_job });
  } catch (e: any) { return Response.json({ ok: false, error: e.message }, { status: 503 }); }
}
