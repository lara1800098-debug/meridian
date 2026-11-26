import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, Field, PageHeader, Select } from '@/components/ui';
import { sql } from '@/db';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { rescoreSignal } from '@/lib/ingest/pipeline';
import { whoCallsWhom } from '@/lib/data/cockpit';
import { date } from '@/lib/format';

async function addRel(fd: FormData) {
  'use server';
  const u = await requireUser();
  const orgName = String(fd.get('org') ?? '').trim();
  const [o] = await sql`SELECT id FROM organisations WHERE lower(name_en) = lower(${orgName}) OR id::text = ${orgName} OR similarity(name_en, ${orgName}) > 0.6 ORDER BY similarity(name_en, ${orgName}) DESC LIMIT 1`;
  const orgId = o?.id ?? (await sql`INSERT INTO organisations (name_en) VALUES (${orgName}) RETURNING id`)[0].id;
  const strength = String(fd.get('strength'));
  if (!['strong', 'medium', 'weak'].includes(strength)) throw new Error('Bad strength');
  await sql`INSERT INTO relationships (user_id, person_name, person_title, org_id, strength, context, last_contact) VALUES (${u.id}, ${String(fd.get('person')).slice(0, 120)}, ${String(fd.get('title') ?? '').slice(0, 120) || null}, ${orgId}, ${strength}, ${String(fd.get('context') ?? '').slice(0, 300)}, ${String(fd.get('last') ?? '') || null})`;
  await audit(u.id, 'access.add', 'organisation', orgId);
  for (const s of await sql`SELECT id FROM signals WHERE org_id = ${orgId}`) await rescoreSignal(s.id); // access score changes
  revalidatePath('/access');
}
async function delRel(id: string) {
  'use server';
  const u = await requireUser();
  await sql`DELETE FROM relationships WHERE id = ${id} AND (user_id = ${u.id} OR ${u.role === 'admin'})`;
  await audit(u.id, 'access.delete', 'relationship', id);
  revalidatePath('/access');
}

export default async function Access() {
  const ctx = await pageCtx();
  const { t, lang, user } = ctx;
  const all = can(user, 'access.view_all');
  const rows = await sql`SELECT r.*, o.name_en AS org_name, u.name AS knower FROM relationships r JOIN organisations o ON o.id = r.org_id JOIN users u ON u.id = r.user_id
    WHERE ${all} OR r.user_id = ${user.id} ORDER BY o.name_en, r.strength`;
  const calls = all ? await whoCallsWhom(user, 10) : [];
  return (
    <Shell ctx={ctx} active="access">
      <PageHeader title={t('access.title')} subtitle={t('access.intro')} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('access.add')}>
          <form action={addRel} className="space-y-3">
            <Field label={t('access.person')} name="person" required />
            <Field label={t('access.personTitle')} name="title" />
            <Field label={t('access.org')} name="org" required />
            <Select name="strength" value="medium" label={t('access.strength')} options={[['strong', t('access.strong')], ['medium', t('access.medium')], ['weak', t('access.weak')]]} />
            <Field label={t('access.context')} name="context" placeholder="e.g. former colleague, met at GITEX" />
            <Field label={t('access.last')} name="last" type="date" />
            <button className="btn-primary">{t('common.add')}</button>
          </form>
        </Card>
        <Card className="lg:col-span-2" title={t('access.title')}>
          <table className="table"><thead><tr><th>{t('access.org')}</th><th>{t('access.person')}</th><th>{t('access.strength')}</th><th>{t('common.owner')}</th><th /></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td><Link className="hover:underline" href={`/orgs/${r.org_id}`}>{r.org_name}</Link></td><td>{r.person_name}<div className="text-xs text-ink-3">{r.person_title} {r.context && `· ${r.context}`}</div></td><td className="text-xs">{t(`access.${r.strength}`)}<div className="text-ink-3">{date(r.last_contact, lang)}</div></td><td className="text-xs">{r.knower}</td>
              <td>{(r.user_id === user.id || user.role === 'admin') && <form action={delRel.bind(null, r.id)}><button className="text-xs text-bad hover:underline">{t('common.delete')}</button></form>}</td></tr>)}</tbody></table>
        </Card>
        {all && <Card className="lg:col-span-3" title={t('access.who')}><ul className="grid gap-2 text-sm md:grid-cols-2">{calls.map((c, i) => <li key={i} className="rounded-ctl border border-line p-3"><b>{c.knower}</b> → {c.person_name} ({c.org_name}) <div className="text-xs text-ink-3"><Link className="underline" href={`/plays/${c.play_id}`}>{c.headline}</Link> · {c.total}</div></li>)}</ul></Card>}
      </div>
    </Shell>
  );
}
