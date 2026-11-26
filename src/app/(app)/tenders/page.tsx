import Link from 'next/link';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, PageHeader } from '@/components/ui';
import { sql } from '@/db';
import { date } from '@/lib/format';
import { uploadTender } from './actions';
import { assertCan } from '@/lib/rbac';

export default async function Tenders() {
  const ctx = await pageCtx();
  const { t, lang } = ctx;
  assertCan(ctx.user, 'tenders');
  const rows = await sql`SELECT t.id, t.filename, t.decision, t.created_at, t.method, u.name FROM tenders t LEFT JOIN users u ON u.id = t.uploaded_by ORDER BY created_at DESC LIMIT 100`;
  return (
    <Shell ctx={ctx} active="tenders">
      <PageHeader title={t('tenders.title')} />
      <Card className="mb-4 max-w-xl">
        <form action={uploadTender} className="space-y-3"><label className="block"><span className="label">{t('tenders.upload')}</span><input type="file" name="file" accept=".pdf,.docx,.txt" required className="input" /></label><button className="btn-primary">{t('common.upload')}</button></form>
        <p className="mt-2 text-xs text-ink-3">Files are stored privately on this server. For portals that require login, download the documents yourself and upload them here — Meridian never logs in to procurement portals.</p>
      </Card>
      <Card><table className="table"><tbody>{rows.map((r) => <tr key={r.id}><td><Link className="hover:underline" href={`/tenders/${r.id}`}>{r.filename}</Link></td><td className="text-xs">{r.decision ? t(`tenders.${r.decision}`) : '—'}</td><td className="text-xs">{r.name} · {date(r.created_at, lang)}</td><td className="text-xs">{r.method}</td></tr>)}</tbody></table></Card>
    </Shell>
  );
}
