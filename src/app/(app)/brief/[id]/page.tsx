import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, PageHeader } from '@/components/ui';
import { BriefView } from '@/components/BriefView';
import { sql } from '@/db';
import { date } from '@/lib/format';
import { generateNow } from '../actions';

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const { t, lang, user, cur, fx } = ctx;
  const [b] = await sql`SELECT * FROM briefs WHERE id = ${id} AND user_id = ${user.id}`;
  if (!b) notFound();
  await sql`UPDATE briefs SET read_at = coalesce(read_at, now()) WHERE id = ${id}`;
  await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${user.id} AND href = ${`/brief/${id}`}`;
  const [prev] = await sql`SELECT * FROM briefs WHERE user_id = ${user.id} AND week_start < ${b.week_start} ORDER BY week_start DESC LIMIT 1`;
  const archive = await sql`SELECT id, week_start FROM briefs WHERE user_id = ${user.id} ORDER BY week_start DESC LIMIT 26`;
  return (
    <Shell ctx={ctx} active="brief">
      <PageHeader title={t('brief.title')} subtitle={t('brief.week', { d: date(b.week_start, lang) })}
        actions={<><a className="btn-primary" href={`/api/pdf?p=/print/brief/${id}`}>{t('common.exportPdf')}</a><form action={generateNow}><button className="btn-ghost">{t('brief.generate')}</button></form></>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <Card className="max-w-3xl"><BriefView b={b} prev={prev} t={t} lang={lang} cur={cur} fx={fx} /></Card>
        <Card title={t('brief.archive')}><ul className="space-y-1 text-sm">{archive.map((a) => <li key={a.id}><Link className={`hover:underline ${a.id === id ? 'font-semibold' : ''}`} href={`/brief/${a.id}`}>{date(a.week_start, lang)}</Link></li>)}</ul></Card>
      </div>
    </Shell>
  );
}
