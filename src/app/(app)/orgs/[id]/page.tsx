import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, DemoTag, Field, PageHeader, Select, TierBadge } from '@/components/ui';
import { sql } from '@/db';
import { date } from '@/lib/format';
import { requireUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { ORG_TYPES, SECTORS } from '@/lib/taxonomy';
import { can } from '@/lib/rbac';

async function addNote(orgId: string, fd: FormData) {
  'use server';
  const u = await requireUser();
  const body = String(fd.get('body') ?? '').trim().slice(0, 4000);
  if (body) await sql`INSERT INTO org_notes (org_id, user_id, body) VALUES (${orgId}, ${u.id}, ${body})`;
  revalidatePath(`/orgs/${orgId}`);
}
async function updateOrg(orgId: string, fd: FormData) {
  'use server';
  const u = await requireUser();
  if (!can(u, 'deals.edit')) throw new Error('Forbidden');
  const v = { name_ar: String(fd.get('name_ar') ?? '') || null, sector: String(fd.get('sector')), org_type: String(fd.get('org_type')), size_band: String(fd.get('size_band')), website: String(fd.get('website') ?? '') || null, aliases: String(fd.get('aliases') ?? '').split(',').map((x) => x.trim()).filter(Boolean) };
  await sql`UPDATE organisations SET ${sql(v as any)} WHERE id = ${orgId}`;
  await audit(u.id, 'org.update', 'organisation', orgId);
  revalidatePath(`/orgs/${orgId}`);
}

export default async function OrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const { t, lang, user } = ctx;
  const [o] = await sql`SELECT o.*, p.name_en AS parent FROM organisations o LEFT JOIN organisations p ON p.id = o.parent_id WHERE o.id = ${id}`;
  if (!o) notFound();
  const sigs = await sql`SELECT * FROM signals WHERE org_id = ${id} ORDER BY coalesce(published_at, first_seen_at) DESC`;
  const plays = await sql`SELECT * FROM plays WHERE org_id = ${id} ORDER BY created_at DESC`;
  const deals = await sql`SELECT d.* FROM deals d WHERE org_id = ${id} ORDER BY created_at DESC`;
  const people = await sql`SELECT * FROM people WHERE org_id = ${id}`;
  const notes = await sql`SELECT n.*, u.name FROM org_notes n JOIN users u ON u.id = n.user_id WHERE org_id = ${id} ORDER BY created_at DESC`;
  return (
    <Shell ctx={ctx} active="orgs">
      <PageHeader title={<>{o.name_en}{o.name_ar && <span className="ms-3 font-ar text-ink-2" dir="rtl">{o.name_ar}</span>}</>}
        subtitle={<span className="flex flex-wrap gap-2">{t(`orgTypes.${o.org_type}`)} · {t(`sectors.${o.sector}`)} · {t(`countries.${o.country}`)}{o.is_demo && <DemoTag t={t} />}</span>}
        actions={<><Link className="btn-primary" href={`/orgs/${id}/brief`}>{t('orgs.meetingBrief')}</Link></>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t('orgs.timeline')}>
            <ol className="relative space-y-3 border-s border-line ps-4">{sigs.map((s) => <li key={s.id}><span className="absolute -start-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-surface bg-brand-a1" /><Link className="text-sm font-medium hover:underline" href={`/signals/${s.id}`}>{s.title}</Link><div className="text-xs text-ink-3">{date(s.published_at ?? s.first_seen_at, lang)} · {t(`signalTypes.${s.signal_type}`)} · <TierBadge tier={s.tier} t={t} /></div></li>)}</ol>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card title={t('orgs.openPlays')}><ul className="space-y-1 text-sm">{plays.map((p) => <li key={p.id}><Link className="hover:underline" href={`/plays/${p.id}`}>{lang === 'ar' ? p.headline_ar ?? p.headline : p.headline}</Link> <span className="text-xs text-ink-3">{t(`plays.status.${p.status}`)}</span></li>)}{!plays.length && <li className="muted">{t('common.none')}</li>}</ul></Card>
            <Card title={t('orgs.deals')}><ul className="space-y-1 text-sm">{deals.map((d) => <li key={d.id}><Link className="hover:underline" href={`/deals/${d.id}`}>{d.title}</Link> <span className="text-xs text-ink-3">{t(`deals.status.${d.status}`)}</span></li>)}{!deals.length && <li className="muted">{t('common.none')}</li>}</ul></Card>
          </div>
          <Card title={t('orgs.notes')}>
            <form action={addNote.bind(null, id)} className="mb-3 flex gap-2"><input name="body" className="input" placeholder={t('orgs.addNote')} /><button className="btn-ghost">{t('common.add')}</button></form>
            <ul className="space-y-2 text-sm">{notes.map((n) => <li key={n.id}><span className="text-xs text-ink-3">{n.name} · {date(n.created_at, lang)}</span><div>{n.body}</div></li>)}</ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title={t('orgs.dossier')}>
            <form action={updateOrg.bind(null, id)} className="space-y-3">
              <Field label="Name (AR)" name="name_ar" defaultValue={o.name_ar} />
              <Field label="Aliases (comma-separated)" name="aliases" defaultValue={o.aliases.join(', ')} />
              <Select name="sector" value={o.sector} label={t('common.sector')} options={SECTORS.map((s) => [s, t(`sectors.${s}`)])} />
              <Select name="org_type" value={o.org_type} label={t('orgs.type')} options={ORG_TYPES.map((s) => [s, t(`orgTypes.${s}`)])} />
              <Select name="size_band" value={o.size_band} label={t('orgs.size')} options={['unknown', 'small', 'medium', 'large', 'enterprise'].map((s) => [s, s])} />
              <Field label={t('orgs.website')} name="website" defaultValue={o.website} />
              {o.parent && <p className="text-xs">{t('orgs.parent')}: {o.parent}</p>}
              {can(user, 'deals.edit') && <button className="btn-ghost">{t('common.save')}</button>}
            </form>
          </Card>
          <Card title={t('orgs.people')}><ul className="space-y-1 text-sm">{people.map((p) => <li key={p.id}>{p.name}{p.title ? ` — ${p.title}` : ''}<div className="text-xs text-ink-3">{p.source_url} · {date(p.seen_at, lang)}</div></li>)}{!people.length && <li className="muted">{t('common.none')}</li>}</ul></Card>
        </div>
      </div>
    </Shell>
  );
}
