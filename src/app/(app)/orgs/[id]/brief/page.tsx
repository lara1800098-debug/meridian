import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, PageHeader } from '@/components/ui';
import { MeetingBrief } from '@/components/MeetingBrief';
import { sql } from '@/db';
import { notFound } from 'next/navigation';

export default async function MB({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const [o] = await sql`SELECT name_en, name_ar FROM organisations WHERE id = ${id}`;
  if (!o) notFound();
  return (
    <Shell ctx={ctx} active="orgs">
      <PageHeader title={`${ctx.t('orgs.meetingBrief')} — ${ctx.lang === 'ar' ? o.name_ar ?? o.name_en : o.name_en}`} actions={<a className="btn-primary" href={`/api/pdf?p=/print/meeting/${id}`}>{ctx.t('common.exportPdf')}</a>} />
      <Card className="max-w-3xl"><MeetingBrief ctx={ctx} orgId={id} /></Card>
    </Shell>
  );
}
