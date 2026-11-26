import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, Field, PageHeader } from '@/components/ui';
import { sql } from '@/db';
import { requireUser } from '@/lib/auth';
import { assertCan, can } from '@/lib/rbac';
import { date } from '@/lib/format';

async function addEvent(fd: FormData) {
  'use server';
  const u = await requireUser();
  assertCan(u, 'admin');
  await sql`INSERT INTO events (name, city, start_date, end_date, keywords, notes) VALUES (${String(fd.get('name'))}, ${String(fd.get('city') ?? 'Dubai')}, ${String(fd.get('start'))}, ${String(fd.get('end'))}, ${String(fd.get('keywords') ?? '').split(',').map((x) => x.trim()).filter(Boolean)}, ${String(fd.get('notes') ?? '')})`;
  revalidatePath('/events');
}

export default async function Events() {
  const ctx = await pageCtx();
  const { t, lang, user } = ctx;
  const events = await sql`SELECT * FROM events WHERE end_date >= current_date - 30 ORDER BY start_date`;
  const targets = await Promise.all(events.map(async (e) => ({
    e,
    orgs: await sql`SELECT DISTINCT ON (o.id) o.id, o.name_en, s.total, s.title FROM signals s JOIN organisations o ON o.id = s.org_id
      WHERE s.first_seen_at > now() - interval '120 days' AND (s.title ILIKE ANY(${e.keywords.map((k: string) => `%${k}%`)}) OR (cardinality(${e.sectors}::text[]) > 0 AND s.sector = ANY(${e.sectors}) AND s.tier IN ('leader','team')))
      ORDER BY o.id, s.total DESC LIMIT 12`,
  })));
  return (
    <Shell ctx={ctx} active="events">
      <PageHeader title={t('events.title')} />
      <div className="grid gap-4 lg:grid-cols-2">
        {targets.map(({ e, orgs }) => (
          <Card key={e.id} title={`${e.name} · ${e.city}`} action={<span className="text-xs text-ink-3">{date(e.start_date, lang)} – {date(e.end_date, lang)}</span>}>
            {e.notes && <p className="mb-2 text-xs text-ink-3">{e.notes}</p>}
            <div className="label">{t('events.targets')}</div>
            <ul className="space-y-1 text-sm">{orgs.sort((a, b) => b.total - a.total).map((o) => <li key={o.id} className="flex justify-between gap-2"><Link className="hover:underline" href={`/orgs/${o.id}`}>{o.name_en}</Link><Link className="text-xs text-brand-a1 underline" href={`/orgs/${o.id}/brief`}>{t('orgs.meetingBrief')}</Link></li>)}{!orgs.length && <li className="muted">{t('common.none')}</li>}</ul>
          </Card>
        ))}
        {can(user, 'admin') && (
          <Card title={t('events.add')}>
            <form action={addEvent} className="grid grid-cols-2 gap-3">
              <Field label={t('common.name')} name="name" required className="col-span-2" />
              <Field label="City" name="city" defaultValue="Dubai" />
              <Field label="Keywords" name="keywords" placeholder="GITEX, ..." />
              <Field label="Start" name="start" type="date" required />
              <Field label="End" name="end" type="date" required />
              <Field label={t('common.notes')} name="notes" className="col-span-2" />
              <button className="btn-primary">{t('common.add')}</button>
            </form>
          </Card>
        )}
      </div>
    </Shell>
  );
}
