import { notFound } from 'next/navigation';
import { pageCtx } from '@/lib/ctx';
import { sql } from '@/db';
import { BriefView } from '@/components/BriefView';
import PrintFrame from '../../PrintFrame';
import { date } from '@/lib/format';

export default async function PrintBrief({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t, lang, user, cur, fx } = await pageCtx();
  const [b] = await sql`SELECT * FROM briefs WHERE id = ${id} AND user_id = ${user.id}`;
  if (!b) notFound();
  const [prev] = await sql`SELECT * FROM briefs WHERE user_id = ${user.id} AND week_start < ${b.week_start} ORDER BY week_start DESC LIMIT 1`;
  return <PrintFrame t={t} lang={lang} title={t('brief.title')} subtitle={`${user.name} · ${t('brief.week', { d: date(b.week_start, lang) })}`}><BriefView b={b} prev={prev} t={t} lang={lang} cur={cur} fx={fx} print /></PrintFrame>;
}
