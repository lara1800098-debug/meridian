import { pageCtx } from '@/lib/ctx';
import { MeetingBrief } from '@/components/MeetingBrief';
import PrintFrame from '../../PrintFrame';
import { sql } from '@/db';
export default async function PM({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const [o] = await sql`SELECT name_en, name_ar FROM organisations WHERE id = ${id}`;
  return <PrintFrame t={ctx.t} lang={ctx.lang} title={ctx.t('orgs.meetingBrief')} subtitle={ctx.lang === 'ar' ? o?.name_ar ?? o?.name_en : o?.name_en}><MeetingBrief ctx={ctx} orgId={id} print /></PrintFrame>;
}
