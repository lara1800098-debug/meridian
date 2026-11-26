import { redirect } from 'next/navigation';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Empty, PageHeader } from '@/components/ui';
import { sql } from '@/db';
import { generateNow } from './actions';

export default async function BriefIndex() {
  const ctx = await pageCtx();
  const [b] = await sql`SELECT id FROM briefs WHERE user_id = ${ctx.user.id} ORDER BY week_start DESC LIMIT 1`;
  if (b) redirect(`/brief/${b.id}`);
  return (
    <Shell ctx={ctx} active="brief">
      <PageHeader title={ctx.t('brief.title')} actions={<form action={generateNow}><button className="btn-primary">{ctx.t('brief.generate')}</button></form>} />
      <Empty>{ctx.t('brief.none')}</Empty>
    </Shell>
  );
}
