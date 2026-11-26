import { notFound } from 'next/navigation';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, PageHeader, Select, SuggestTag } from '@/components/ui';
import { sql } from '@/db';
import { goNoGo } from '@/lib/engine/tender';
import { attachTender, decideTender } from '../actions';
import { assertCan } from '@/lib/rbac';

export default async function TenderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const { t, user } = ctx;
  assertCan(user, 'tenders');
  const [tn] = await sql`SELECT * FROM tenders WHERE id = ${id}`;
  if (!tn) notFound();
  const fields = tn.extracted.fields ?? {};
  const g = goNoGo(fields);
  const deals = await sql`SELECT id, title FROM deals WHERE status = 'open' ORDER BY created_at DESC LIMIT 100`;
  const cls = { ok: 'text-good', review: 'text-warn', block: 'text-bad' } as const;
  return (
    <Shell ctx={ctx} active="tenders">
      <PageHeader title={tn.filename} subtitle={`${t('signals.method')}: ${tn.method}`} />
      {tn.extracted.ocr && <p className="mb-4 rounded-ctl bg-info/10 p-3 text-sm text-info">{t('tenders.ocrUsed')}</p>}
      {tn.extracted.scanned && <p className="mb-4 rounded-ctl bg-warn/15 p-3 text-sm text-warn">{t('tenders.scanned')}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={t('tenders.extracted')}>
          <table className="table"><thead><tr><th>Field</th><th>{t('common.value')}</th><th>{t('tenders.citation')}</th></tr></thead>
            <tbody>{Object.entries(fields).map(([k, v]: any) => <tr key={k}><td className="text-xs font-medium">{k.replace(/_/g, ' ')}</td><td className="text-sm" dir="auto">{v.value ?? <span className="text-ink-3">{t('common.unknown')}</span>}</td><td className="text-xs text-ink-2" dir="auto">{v.quote ? <q>{v.quote}</q> : '—'}</td></tr>)}</tbody></table>
        </Card>
        <div className="space-y-4">
          <Card title={<span className="flex items-center gap-2">{t('tenders.gonogo')} <SuggestTag t={t} /></span>}>
            <ul className="space-y-2 text-sm">{g.checks.map((c) => <li key={c.item}><span className={cls[c.status]}>{c.status === 'ok' ? '✓' : c.status === 'review' ? '!' : '✗'}</span> <b>{c.item}</b><div className="text-xs text-ink-3">{c.note}</div></li>)}</ul>
            <p className="mt-3 text-sm">{t('tenders.recommendation')}: <b>{t(`tenders.${g.recommendation}`)}</b></p>
            <form action={decideTender.bind(null, id)} className="mt-3 flex gap-2">
              <Select name="decision" value={tn.decision ?? g.recommendation} options={[['go', t('tenders.go')], ['nogo', t('tenders.nogo')], ['review', t('tenders.review')]]} />
              <button className="btn-ghost">{t('tenders.decide')}</button>
            </form>
          </Card>
          <Card title={t('tenders.attach')}>
            <form action={attachTender.bind(null, id)} className="space-y-2">
              <Select name="deal" value={tn.deal_id ?? ''} options={[['', `+ ${t('deals.new')}`], ...deals.map((d) => [d.id, d.title] as [string, string])]} />
              <button className="btn-primary w-full">{t('tenders.attach')}</button>
            </form>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
