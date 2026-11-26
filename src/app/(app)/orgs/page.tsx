import Link from 'next/link';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, DemoTag, PageHeader } from '@/components/ui';
import { sql } from '@/db';

export default async function Orgs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await pageCtx();
  const { t, lang } = ctx;
  const q = (await searchParams).q ?? '';
  const rows = await sql`
    SELECT o.*, (SELECT count(*) FROM signals WHERE org_id = o.id)::int AS n_sig, (SELECT count(*) FROM plays WHERE org_id = o.id AND status = 'new')::int AS n_play, (SELECT count(*) FROM deals WHERE org_id = o.id AND status = 'open')::int AS n_deal
    FROM organisations o ${q ? sql`WHERE o.name_en ILIKE ${'%' + q + '%'} OR o.name_ar ILIKE ${'%' + q + '%'} OR similarity(o.name_en, ${q}) > 0.3` : sql``}
    ORDER BY n_play DESC, n_sig DESC, o.name_en LIMIT 200`;
  return (
    <Shell ctx={ctx} active="orgs">
      <PageHeader title={t('orgs.title')} />
      <form className="mb-4 max-w-md"><input name="q" defaultValue={q} className="input" placeholder={t('common.search')} /></form>
      <Card>
        <table className="table"><thead><tr><th>{t('common.name')}</th><th>{t('orgs.type')}</th><th>{t('nav.signals')}</th><th>{t('nav.plays')}</th><th>{t('nav.deals')}</th></tr></thead>
          <tbody>{rows.map((o) => <tr key={o.id}><td><Link className="font-medium hover:underline" href={`/orgs/${o.id}`}>{lang === 'ar' ? o.name_ar ?? o.name_en : o.name_en}</Link>{o.is_demo && <> <DemoTag t={t} /></>}{o.is_competitor && <span className="chip ms-1 bg-bad/10 text-bad">{t('tracks.competitor')}</span>}<div className="text-xs text-ink-3">{t(`sectors.${o.sector}`)} · {t(`countries.${o.country}`)}</div></td><td className="text-xs">{t(`orgTypes.${o.org_type}`)}</td><td className="font-num">{o.n_sig}</td><td className="font-num">{o.n_play}</td><td className="font-num">{o.n_deal}</td></tr>)}</tbody></table>
      </Card>
    </Shell>
  );
}
