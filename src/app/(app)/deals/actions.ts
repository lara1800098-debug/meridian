'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sql } from '@/db';
import { requireUser } from '@/lib/auth';
import { assertCan } from '@/lib/rbac';
import { canSeeDeal } from '@/lib/data/deals';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { CURRENCIES, DEAL_SOURCES, LOSS_REASONS, SECTORS } from '@/lib/taxonomy';
import { z } from 'zod';

async function guard(id: string) {
  const u = await requireUser();
  assertCan(u, 'deals.edit');
  if (!(await canSeeDeal(u, id))) throw new Error('Not found');
  const [d] = await sql`SELECT * FROM deals WHERE id = ${id}`;
  return { u, d };
}

const s = (v: FormDataEntryValue | null) => (v == null ? null : String(v).trim() || null);
const dateOrNull = (v: FormDataEntryValue | null) => (s(v) && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);

async function log(dealId: string, userId: string, changes: [string, any, any][], note?: string | null) {
  for (const [f, o, n] of changes) {
    const os = o instanceof Date ? o.toISOString().slice(0, 10) : o == null ? null : String(o);
    const ns = n == null ? null : String(n);
    if (os !== ns) await sql`INSERT INTO deal_history (deal_id, user_id, field, old_value, new_value, note) VALUES (${dealId}, ${userId}, ${f}, ${os}, ${ns}, ${note ?? null})`;
  }
  if (note) await sql`INSERT INTO deal_history (deal_id, user_id, field, new_value) VALUES (${dealId}, ${userId}, 'note', ${note})`;
}

/** Quick update: stage, next step, date, one-line note — the < 60 second path. */
export async function quickUpdate(id: string, fd: FormData) {
  const { u, d } = await guard(id);
  const stage = s(fd.get('stage')) ?? d.stage;
  const [st] = await sql`SELECT key, is_closed FROM stages WHERE key = ${stage}`;
  if (!st || st.is_closed) throw new Error('Use the close actions for Won/Lost/No decision');
  const next = s(fd.get('next_step')), nextDate = dateOrNull(fd.get('next_step_date')), note = s(fd.get('note'));
  await log(id, u.id, [['stage', d.stage, stage], ['next_step', d.next_step, next], ['next_step_date', d.next_step_date, nextDate]], note);
  await sql`UPDATE deals SET stage = ${stage}, next_step = ${next}, next_step_date = ${nextDate}, last_activity_at = now(),
    stage_entered_at = CASE WHEN stage <> ${stage} THEN now() ELSE stage_entered_at END WHERE id = ${id}`;
  await audit(u.id, 'deal.quick_update', 'deal', id);
  revalidatePath(`/deals/${id}`);
  revalidatePath('/deals');
}

export async function updateDeal(id: string, fd: FormData) {
  const { u, d } = await guard(id);
  const st = await getSettings();
  const tcv = Number(fd.get('tcv') ?? d.tcv) || 0, annual = Number(fd.get('annual_value') ?? d.annual_value) || 0;
  const close = dateOrNull(fd.get('expected_close'));
  const oldClose = d.expected_close ? new Date(d.expected_close).toISOString().slice(0, 10) : null;
  const pushed = oldClose && close && close > oldClose ? 1 : 0;
  const valueNote = s(fd.get('value_note'));
  const jump = Number(d.tcv) > 0 && Math.abs(tcv - Number(d.tcv)) / Number(d.tcv) * 100 > st.valueChangePct;
  const cur = String(fd.get('currency') ?? d.currency);
  const sector = String(fd.get('sector') ?? d.sector);
  const src = String(fd.get('source') ?? d.source);
  const v = {
    title: s(fd.get('title')) ?? d.title, tcv, annual_value: annual, currency: (CURRENCIES as readonly string[]).includes(cur) ? cur : d.currency,
    expected_close: close, economic_buyer: s(fd.get('economic_buyer')), champion: s(fd.get('champion')), compelling_event: s(fd.get('compelling_event')),
    decision_date: dateOrNull(fd.get('decision_date')), scope_recorded: fd.get('scope_recorded') === 'on', owner_commit: fd.get('owner_commit') === 'on',
    competitors: String(fd.get('competitors') ?? '').split(',').map((x) => x.trim()).filter(Boolean), notes: String(fd.get('notes') ?? d.notes),
    sector: (SECTORS as readonly string[]).includes(sector) ? sector : d.sector, track: fd.get('track') === 'smb' ? 'smb' : 'enterprise',
    source: (DEAL_SOURCES as readonly string[]).includes(src) ? src : d.source, owner_id: s(fd.get('owner_id')) ?? d.owner_id,
    probability_override: s(fd.get('probability_override')) ? Math.max(0, Math.min(100, Number(fd.get('probability_override')))) : null,
  };
  await log(id, u.id, Object.entries(v).filter(([k]) => k !== 'notes').map(([k, val]) => [k, d[k], Array.isArray(val) ? val.join(',') : val] as [string, any, any]).map(([k, o, n]) => [k, Array.isArray(o) ? o.join(',') : o, n]), valueNote);
  await sql`UPDATE deals SET ${sql(v as any)}, close_date_pushes = close_date_pushes + ${pushed}, last_activity_at = now(),
    value_change_unexplained = ${jump && !valueNote ? true : jump ? false : d.value_change_unexplained} WHERE id = ${id}`;
  await audit(u.id, 'deal.update', 'deal', id);
  revalidatePath(`/deals/${id}`);
}

export async function closeDeal(id: string, fd: FormData) {
  const { u, d } = await guard(id);
  const outcome = String(fd.get('outcome'));
  if (!['won', 'lost', 'no_decision'].includes(outcome)) throw new Error('Bad outcome');
  const reason = s(fd.get('reason')), note = s(fd.get('note')), finalValue = Number(fd.get('final_value') ?? 0);
  if (outcome !== 'won' && !(LOSS_REASONS as readonly string[]).includes(reason ?? '')) throw new Error('A reason is required');
  if (outcome === 'won' && !(finalValue > 0)) throw new Error('Final value is required');
  await log(id, u.id, [['stage', d.stage, outcome], ['status', d.status, outcome]], note);
  await sql`UPDATE deals SET status = ${outcome}, stage = ${outcome}, close_reason = ${reason}, close_note = ${note}, final_value = ${outcome === 'won' ? finalValue : null}, closed_at = now(), last_activity_at = now() WHERE id = ${id}`;
  if (d.play_id) await sql`INSERT INTO play_outcomes (play_id, outcome, reason) VALUES (${d.play_id}, ${outcome === 'won' ? 'won' : 'lost'}, ${reason})`;
  await audit(u.id, 'deal.close', 'deal', id, { outcome, reason });
  revalidatePath(`/deals/${id}`);
}

const NewDeal = z.object({ title: z.string().min(3).max(200), org: z.string().max(200).optional(), tcv: z.coerce.number().min(0), currency: z.enum(CURRENCIES), country: z.string().length(2), sector: z.enum(SECTORS), track: z.enum(['enterprise', 'smb']), source: z.enum(DEAL_SOURCES), expected_close: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')) });

export async function createDeal(fd: FormData) {
  const u = await requireUser();
  assertCan(u, 'deals.edit');
  const v = NewDeal.parse(Object.fromEntries(fd));
  let orgId: string | null = null;
  if (v.org) {
    const [o] = await sql`SELECT id FROM organisations WHERE lower(name_en) = lower(${v.org}) OR similarity(name_en, ${v.org}) > 0.7 ORDER BY similarity(name_en, ${v.org}) DESC LIMIT 1`;
    orgId = o?.id ?? (await sql`INSERT INTO organisations (name_en, sector, country) VALUES (${v.org}, ${v.sector}, ${v.country}) RETURNING id`)[0].id;
  }
  const [d] = await sql`INSERT INTO deals (org_id, title, tcv, annual_value, currency, country, sector, track, source, stage, owner_id, created_by, expected_close)
    VALUES (${orgId}, ${v.title}, ${v.tcv}, ${v.tcv}, ${v.currency}, ${v.country}, ${v.sector}, ${v.track}, ${v.source}, 'identified', ${u.id}, ${u.id}, ${v.expected_close || null}) RETURNING id`;
  await sql`INSERT INTO deal_history (deal_id, user_id, field, new_value) VALUES (${d.id}, ${u.id}, 'stage', 'identified')`;
  await audit(u.id, 'deal.create', 'deal', d.id);
  redirect(`/deals/${d.id}`);
}
