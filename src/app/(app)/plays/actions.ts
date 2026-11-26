'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sql } from '@/db';
import { requireUser } from '@/lib/auth';
import { assertCan } from '@/lib/rbac';
import { playScope } from '@/lib/data/deals';
import { audit } from '@/lib/audit';
import { DISMISS_REASONS } from '@/lib/taxonomy';
import { aiOutreach } from '@/lib/ai/tasks';

async function loadPlay(id: string) {
  const u = await requireUser();
  assertCan(u, 'plays.act');
  const [p] = await sql`SELECT p.*, s.country, s.sector, s.track, s.signal_type, s.title AS signal_title, s.org_id AS s_org, s.is_demo AS s_demo
    FROM plays p JOIN signals s ON s.id = p.signal_id WHERE p.id = ${id} AND ${playScope(u)}`;
  if (!p) throw new Error('Not found');
  return { u, p };
}

export async function acceptPlay(id: string) {
  const { u, p } = await loadPlay(id);
  if (p.deal_id) redirect(`/deals/${p.deal_id}`);
  const [cur] = await sql`SELECT currency FROM users WHERE id = ${u.id}`;
  const [fx] = await sql`SELECT per_usd FROM fx_rates WHERE currency = ${cur.currency}`;
  const mid = (Number(p.value_low_usd ?? 0) + Number(p.value_high_usd ?? 0)) / 2 * Number(fx?.per_usd ?? 1);
  const [d] = await sql`
    INSERT INTO deals (org_id, title, track, country, sector, offer_keys, tcv, annual_value, currency, stage, owner_id, source, play_id, compelling_event, created_by, expected_close, next_step, next_step_date, is_demo)
    VALUES (${p.org_id}, ${p.headline.slice(0, 200)}, ${p.track === 'smb' ? 'smb' : 'enterprise'}, ${p.country}, ${p.sector}, ${p.offer_keys}, ${Math.round(mid)}, ${Math.round(mid)}, ${cur.currency},
            'identified', ${p.owner_id ?? u.id}, 'meridian', ${p.id}, ${p.signal_title.slice(0, 300)}, ${u.id}, (current_date + 120), 'First outreach (see play drafts)', (current_date + 3), ${p.is_demo})
    RETURNING id`;
  await sql`INSERT INTO deal_signals (deal_id, signal_id) VALUES (${d.id}, ${p.signal_id})`;
  await sql`INSERT INTO deal_history (deal_id, user_id, field, new_value, note) VALUES (${d.id}, ${u.id}, 'stage', 'identified', 'Created from Meridian play')`;
  await sql`UPDATE plays SET status = 'accepted', deal_id = ${d.id} WHERE id = ${id}`;
  await sql`INSERT INTO play_outcomes (play_id, outcome, signal_type, total) VALUES (${id}, 'accepted', ${p.signal_type}, ${p.total})`;
  await audit(u.id, 'play.accept', 'play', id, { dealId: d.id });
  redirect(`/deals/${d.id}?from=play`);
}

export async function dismissPlay(id: string, fd: FormData) {
  const { u, p } = await loadPlay(id);
  const reason = String(fd.get('reason'));
  if (!(DISMISS_REASONS as readonly string[]).includes(reason)) throw new Error('Reason required');
  await sql`UPDATE plays SET status = 'dismissed', dismiss_reason = ${reason} WHERE id = ${id}`;
  await sql`INSERT INTO play_outcomes (play_id, outcome, reason, signal_type, total) VALUES (${id}, 'dismissed', ${reason}, ${p.signal_type}, ${p.total})`;
  await audit(u.id, 'play.dismiss', 'play', id, { reason });
  revalidatePath('/plays');
  redirect('/plays');
}

export async function snoozePlay(id: string) {
  const { u, p } = await loadPlay(id);
  await sql`UPDATE plays SET status = 'snoozed', snooze_until = current_date + 14 WHERE id = ${id}`;
  await sql`INSERT INTO play_outcomes (play_id, outcome, signal_type, total) VALUES (${id}, 'snoozed', ${p.signal_type}, ${p.total})`;
  await audit(u.id, 'play.snooze', 'play', id);
  redirect('/plays');
}

export async function assignPlay(id: string, fd: FormData) {
  const { u } = await loadPlay(id);
  const owner = String(fd.get('owner'));
  await sql`UPDATE plays SET owner_id = ${owner} WHERE id = ${id}`;
  await sql`INSERT INTO notifications (user_id, kind, title, href) SELECT ${owner}, 'play', headline, ${`/plays/${id}`} FROM plays WHERE id = ${id}`;
  await audit(u.id, 'play.assign', 'play', id, { owner });
  revalidatePath(`/plays/${id}`);
}

export async function regenerateOutreach(id: string) {
  const { u, p } = await loadPlay(id);
  const docs = await sql`SELECT sn.id, sn.title, coalesce(sn.body, sn.excerpt) AS body FROM signal_sources ss JOIN snapshots sn ON sn.id = ss.snapshot_id WHERE ss.signal_id = ${p.signal_id} LIMIT 4`;
  const [o] = await sql`SELECT * FROM offers WHERE key = ${p.offer_keys[0] ?? ''}`;
  const [org] = p.org_id ? await sql`SELECT name_en, org_type FROM organisations WHERE id = ${p.org_id}` : [null];
  const proof = p.proof_point ? JSON.parse(p.proof_point).text : '';
  const r = await aiOutreach({ org: org?.name_en ?? 'unknown', orgType: org?.org_type ?? 'private', offer: o?.name_en ?? '', pitch: o?.pitch_en ?? '', proof, docs: docs.map((d) => ({ id: d.id, title: d.title, body: d.body })) });
  if (r) await sql`UPDATE plays SET outreach = ${sql.json(r as any)}, outreach_method = 'ai' WHERE id = ${id}`;
  await audit(u.id, 'play.outreach_regen', 'play', id, { ok: !!r });
  revalidatePath(`/plays/${id}`);
}
