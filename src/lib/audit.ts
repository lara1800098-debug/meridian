import { sql } from '@/db';
export async function audit(userId: string | null, action: string, entity?: string, entityId?: string, meta: Record<string, unknown> = {}) {
  try {
    await sql`INSERT INTO audit_log (user_id, action, entity, entity_id, meta) VALUES (${userId}, ${action}, ${entity ?? null}, ${entityId ?? null}, ${sql.json(meta as any)})`;
  } catch (e) { console.error('audit failed', e); }
}
