import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, Empty, HealthBadge, Kpi, PageHeader, Select, SourceRef } from '@/components/ui';
import { HBar, Lines, Stacked } from '@/components/charts';
import { PlayRow } from '@/components/PlayCard';
import { can } from '@/lib/rbac';
import { cockpitData, marketMoves, topPlays, whoCallsWhom } from '@/lib/data/cockpit';
import { stages } from '@/lib/data/deals';
import { date, fromUsd, money } from '@/lib/format';
import { COUNTRIES, SECTORS } from '@/lib/taxonomy';
import { reasonText, sp } from '@/lib/view';

export default async function Cockpit({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await pageCtx();
  const { t, lang, fx, cur, user } = ctx;
  if (!can(user, 'cockpit')) redirect('/plays');
  const q = await searchParams;
  const dflt = user.role === 'director' && user.countries.length === 1 ? user.countries[0] : 'ALL';
  const f = { country: sp(q.country) ?? dflt, sector: sp(q.sector) ?? 'ALL', track: sp(q.track) ?? 'ALL' };
  const [cd, plays, moves, calls, st] = await Promise.all([
    cockpitData(user, fx, f),
    topPlays(user, { ...f, tier: user.role === 'executive' ? ['leader'] : ['leader', 'team'], limit: 10, days: 14 }),
    marketMoves(user, 7, 6), whoCallsWhom(user, 5), stages(),
  ]);
  const stageName = (k: string) => { const s = st.find((x) => x.key === k); return s ? (lang === 'ar' ? s.name_ar : s.name_en) : k; };
  const m = (v: number) => money(v, cur, fx, lang);
  const { fc } = cd;
  const pct = fc.target ? fc.realistic / fc.target : null;
  const cov = fc.coverage.ratio;
  const conv = (v: number) => Math.round(fromUsd(v, cur, fx));
  const trendData = cd.trend.filter((r) => r.f).map((r) => ({ name: String(r.week_start).slice(5, 10), realistic: conv(Number(r.f.realistic)), weighted: conv(Number(r.f.weighted)), target: conv(Number(r.f.target)) }));
  if (!trendData.length || trendData[trendData.length - 1].name !== 'now') trendData.push({ name: lang === 'ar' ? 'الآن' : 'now', realistic: conv(fc.realistic), weighted: conv(fc.weighted), target: conv(fc.target) });

  return (
    <Shell ctx={ctx} active="cockpit">
      <PageHeader
        title={t('cockpit.title')}
        subtitle={t('cockpit.headline', { plays: cd.newLeader, risks: cd.atRisk.length })}
        actions={<Link className="btn-primary" href="/brief">{t('nav.brief')} →</Link>}
      />
      <form className="no-print mb-4 flex flex-wrap items-end gap-2" aria-label={t('common.filter')}>
        <Select name="country" value={f.country} options={[['ALL', t('countries.ALL')], ...COUNTRIES.map((c) => [c, t(`countries.${c}`)] as [string, string])]} />
        <Select name="sector" value={f.sector} options={[['ALL', t('sectors.ALL')], ...SECTORS.map((s) => [s, t(`sectors.${s}`)] as [string, string])]} />
        <Select name="track" value={f.track} options={[['ALL', t('tracks.ALL')], ['enterprise', t('tracks.enterprise')], ['smb', t('tracks.smb')]]} />
        <button className="btn-ghost">{t('common.apply')}</button>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label={t('cockpit.open')} value={m(cd.pipelineAll)} href="/deals" />
        <Kpi label={t('cockpit.weighted')} value={m(cd.weightedAll)} href="/forecast" />
        <Kpi label={`${t('cockpit.realistic')} · ${cd.quarter}`} value={m(fc.realistic)} sub={pct != null ? `${Math.round(pct * 100)}% ${t('cockpit.ofTarget')} (${m(fc.target)})` : t('cockpit.noTarget')} tone={pct == null ? undefined : pct >= 1 ? 'good' : pct >= 0.8 ? 'warn' : 'bad'} href="/forecast" />
        <Kpi label={t('cockpit.coverage')} value={cov != null ? `${cov.toFixed(1)}×` : '—'} sub={cov != null && cov < fc.coverageThreshold ? t('cockpit.belowCoverage', { x: fc.coverageThreshold }) : undefined} tone={cov == null ? undefined : cov >= fc.coverageThreshold ? 'good' : 'bad'} href="/forecast" />
        <Kpi label={t('cockpit.meridianSourced')} value={m(cd.meridian)} sub={cd.pipelineAll ? `${Math.round((cd.meridian / cd.pipelineAll) * 100)}%` : undefined} href="/deals?source=meridian" />
        <Kpi label={t('cockpit.atRisk')} value={`${cd.atRisk.length} · ${m(cd.atRiskValue)}`} tone={cd.atRisk.length ? 'bad' : 'good'} href="/deals?health=at_risk" />
        <Kpi label={t('cockpit.newPlays')} value={cd.newLeader} href="/plays?tier=leader" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title={t('cockpit.topPlays')} className="lg:col-span-3" action={<Link href="/plays" className="text-xs text-brand-a1 hover:underline">{t('common.viewAll')}</Link>}>
          {plays.length ? <div className="divide-y divide-line">{plays.map((p) => <PlayRow key={p.id} p={p} ctx={ctx} compact />)}</div> : <Empty>{t('plays.empty')}</Empty>}
        </Card>
        <Card title={t('cockpit.topRisks')} className="lg:col-span-2" action={<Link href="/deals?health=at_risk" className="text-xs text-brand-a1 hover:underline">{t('common.viewAll')}</Link>}>
          {cd.atRisk.length ? (
            <ul className="divide-y divide-line">
              {cd.atRisk.slice(0, 5).map((d) => (
                <li key={d.id} className="py-2.5">
                  <Link href={`/deals/${d.id}`} className="flex items-start justify-between gap-2 hover:underline">
                    <span className="text-sm font-medium">{d.title}</span><span className="font-num shrink-0 text-sm">{m(d.tcv_usd)}</span>
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-3"><HealthBadge status={d.health.status} t={t} /><span>{d.health.reasons[0] ? reasonText(d.health.reasons[0], t, lang, stageName) : ''}</span></div>
                </li>
              ))}
            </ul>
          ) : <Empty>✓</Empty>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title={t('cockpit.byStage')}>
          <HBar data={st.filter((s) => !s.is_closed).map((s) => ({ name: stageName(s.key), value: conv(cd.byStage.get(s.key) ?? 0) }))} />
        </Card>
        <Card title={t('cockpit.byCountry')}>
          <HBar data={[...cd.byCountry].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: t(`countries.${k}`), value: conv(v) }))} />
        </Card>
        <Card title={t('cockpit.bySector')}>
          <HBar data={[...cd.bySector].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ name: t(`sectors.${k}`), value: conv(v) }))} />
        </Card>
        <Card title={t('cockpit.byTrack')}>
          <Stacked keys={[{ key: 'enterprise', label: t('tracks.enterprise') }, { key: 'smb', label: t('tracks.smb') }]}
            data={[{ name: cur, enterprise: conv(cd.byTrack.get('enterprise') ?? 0), smb: conv(cd.byTrack.get('smb') ?? 0) }]} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title={t('cockpit.trend')}>
          <Lines data={trendData} keys={[{ key: 'realistic', label: t('forecast.realistic') }, { key: 'weighted', label: t('forecast.weighted') }, { key: 'target', label: t('forecast.target'), dashed: true }]} />
        </Card>
        <Card title={t('cockpit.marketMoves')}>
          {moves.length ? <ul className="space-y-2.5 text-sm">{moves.map((s) => (
            <li key={s.id}><Link href={`/signals/${s.id}`} className="hover:underline">{lang === 'en' ? s.title_en ?? s.title : s.title}</Link>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">{t(`signalTypes.${s.signal_type}`)} · {date(s.first_seen_at, lang)} {s.snapshot_id && <SourceRef href={`/signals/${s.id}#snap-${s.snapshot_id}`} title={t('signals.snapshot')} label={t('common.source')} />}</div></li>
          ))}</ul> : <Empty>{t('common.empty')}</Empty>}
        </Card>
        <Card title={t('cockpit.whoCalls')}>
          {calls.length ? <ul className="space-y-2.5 text-sm">{calls.map((c, i) => (
            <li key={i}><span className="font-medium">{c.knower}</span> → <span>{c.person_name}{c.person_title ? `, ${c.person_title}` : ''}</span> <span className="text-ink-3">({c.org_name})</span>
              <div className="text-xs text-ink-3">{t(`access.${c.strength}`)} · <Link className="underline" href={`/plays/${c.play_id}`}>{c.headline}</Link></div></li>
          ))}</ul> : <Empty>{t('plays.noPath')}</Empty>}
        </Card>
      </div>
    </Shell>
  );
}
