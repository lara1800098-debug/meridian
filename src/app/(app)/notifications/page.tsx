import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, Empty, PageHeader } from '@/components/ui';
import { sql } from '@/db';
import { requireUser } from '@/lib/auth';
import { date } from '@/lib/format';

async function markAll() { 'use server'; const u = await requireUser(); await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${u.id} AND read_at IS NULL`; revalidatePath('/notifications'); }
export default async function Notifications() {
  const ctx = await pageCtx();
  const { t, lang, user } = ctx;
  const rows = await sql`SELECT * FROM notifications WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 100`;
  return (
    <Shell ctx={ctx} active="">
      <PageHeader title={t('nav.notifications')} actions={<form action={markAll}><button className="btn-ghost">✓</button></form>} />
      <Card>{rows.length ? <ul className="divide-y divide-line">{rows.map((n) => <li key={n.id} className={`py-2.5 text-sm ${n.read_at ? 'text-ink-3' : ''}`}><Link className="hover:underline" href={n.href ?? '#'}>{n.title}</Link><div className="text-xs text-ink-3">{n.kind} · {date(n.created_at, lang)}</div></li>)}</ul> : <Empty>{t('common.empty')}</Empty>}</Card>
    </Shell>
  );
}
