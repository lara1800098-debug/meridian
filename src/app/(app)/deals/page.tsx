import Link from 'next/link';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, DemoTag, Empty, Field, HealthBadge, PageHeader, Select } from '@/components/ui';
import { loadDeals, stages } from '@/lib/data/deals';
import { date, money } from '@/lib/format';
import { COUNTRIES, CURRENCIES, DEAL_SOURCES, SECTORS } from '@/lib/taxonomy';
import { createDeal } from './actions';
import { reasonText, sp } from '@/lib/view';
import { can } from '@/lib/rbac';

export default async function Deals({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await pageCtx();
  const { t, lang, fx, cur, user } = ctx;
  const q = await searchParams;
  const f = { status: sp(q.status) ?? 'open', country: sp(q.country) ?? 'ALL', sector: sp(q.sector) ?? 'ALL', track: sp(q.track) ?? 'ALL', health: sp(q.health) ?? 'ALL' };
  const st = await stages();
  const stageName = (k: string) => { const s = st.find((x) => x.key === k); return s ? (lang === 'ar' ? s.name_ar : s.name_en) : k; };
  let deals = await loadDeals(user, fx, { status: f.status === 'ALL' ? undefined : f.status, country: f.country, sector: f.sector, track: f.track });
  if (f.health !== 'ALL') deals = deals.filter((d) => d.health.status === f.health);
  if (sp(q.source)) deals = deals.filter((d) => d.source === sp(q.source));
  const total = deals.reduce((a, d) => a + d.tcv_usd, 0);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== 'ALL') as any).toString();
  return (
    <Shell ctx={ctx} active="deals">
      <PageHeader title={t('deals.title')} subtitle={`${deals.length} · ${money(total, cur, fx, lang)}${q.imported ? ` · ✓ ${q.imported} imported${q.skipped && q.skipped !== '0' ? `, ${q.skipped} already existed` : ''}` : ''}`}
        actions={<>
          <a className="btn-ghost" href={`/api/export/deals?format=xlsx&${qs}`}>{t('common.exportXlsx')}</a>
          <a className="btn-ghost" href={`/api/export/deals?format=csv&${qs}`}>{t('common.exportCsv')}</a>
          {can(user, 'deals.edit') && <Link className="btn-ghost" href="/deals/import">{t('deals.import')}</Link>}
        </>} />
      {can(user, 'deals.edit') && (
        <details className="card mb-4 p-4">
          <summary className="cursor-pointer text-sm font-medium">+ {t('deals.new')}</summary>
          <form action={createDeal} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('common.title')} name="title" required />
            <Field label={t('nav.orgs')} name="org" />
            <Field label={t('deals.tcv')} name="tcv" type="number" defaultValue={0} />
            <Select name="currency" value={user.currency} label={t('common.currency')} options={CURRENCIES.map((c) => [c, c])} />
            <Select name="country" value={user.countries[0] ?? 'AE'} label={t('common.country')} options={COUNTRIES.map((c) => [c, t(`countries.${c}`)])} />
            <Select name="sector" value="government" label={t('common.sector')} options={SECTORS.map((s) => [s, t(`sectors.${s}`)])} />
            <Select name="track" value="enterprise" label={t('common.track')} options={[['enterprise', t('tracks.enterprise')], ['smb', t('tracks.smb')]]} />
            <Select name="source" value="other" label={t('deals.source')} options={DEAL_SOURCES.map((s) => [s, t(`deals.sources.${s}`)])} />
            <Field label={t('deals.close')} name="expected_close" type="date" />
            <div className="flex items-end"><button className="btn-primary">{t('common.add')}</button></div>
          </form>
        </details>
      )}
      <form className="card mb-4 grid grid-cols-2 gap-3 p-4 md:grid-cols-6">
        <Select name="status" value={f.status} label={t('common.status')} options={[['ALL', t('common.all')], ...(['open', 'won', 'lost', 'no_decision'] as const).map((s) => [s, t(`deals.status.${s}`)] as [string, string])]} />
        <Select name="health" value={f.health} label={t('deals.health')} options={[['ALL', t('common.all')], ['at_risk', t('deals.at_risk')], ['watch', t('deals.watch')], ['healthy', t('deals.healthy')]]} />
        <Select name="country" value={f.country} label={t('common.country')} options={[['ALL', t('countries.ALL')], ...COUNTRIES.map((c) => [c, t(`countries.${c}`)] as [string, string])]} />
        <Select name="sector" value={f.sector} label={t('common.sector')} options={[['ALL', t('sectors.ALL')], ...SECTORS.map((s) => [s, t(`sectors.${s}`)] as [string, string])]} />
        <Select name="track" value={f.track} label={t('common.track')} options={[['ALL', t('tracks.ALL')], ['enterprise', t('tracks.enterprise')], ['smb', t('tracks.smb')]]} />
        <div className="flex items-end"><button className="btn-ghost w-full">{t('common.apply')}</button></div>
      </form>
      <Card>
        {deals.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>{t('common.title')}</th><th>{t('deals.stage')}</th><th>{t('deals.tcv')}</th><th>{t('deals.health')}</th><th>{t('deals.close')}</th><th>{t('common.owner')}</th></tr></thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td><Link href={`/deals/${d.id}`} className="font-medium hover:underline">{d.title}</Link><div className="text-xs text-ink-3">{lang === 'ar' ? d.org_name_ar ?? d.org_name : d.org_name} {d.source === 'meridian' && <span className="chip bg-brand-a1/15 text-brand-a1">Meridian</span>} {d.is_demo && <DemoTag t={t} />}</div></td>
                    <td className="whitespace-nowrap text-xs">{stageName(d.stage)}<div className="text-ink-3">{d.probability}%</div></td>
                    <td className="font-num whitespace-nowrap">{money(d.tcv_usd, cur, fx, lang)}</td>
                    <td><HealthBadge status={d.health.status} t={t} />{d.health.reasons[0] && <div className="mt-1 max-w-[16rem] text-xs text-ink-3">{reasonText(d.health.reasons[0], t, lang, stageName)}</div>}</td>
                    <td className="whitespace-nowrap text-xs">{date(d.expected_close, lang)}</td>
                    <td className="whitespace-nowrap text-xs">{d.owner_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>{t('common.empty')}</Empty>}
      </Card>
    </Shell>
  );
}
