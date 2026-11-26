import Link from 'next/link';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, ConfBadge, DemoTag, Empty, PageHeader, Select, TierBadge } from '@/components/ui';
import { sql } from '@/db';
import { date } from '@/lib/format';
import { can, seesEverything } from '@/lib/rbac';
import { runIngestion } from './actions';
import { sp } from '@/lib/view';

export default async function Signals({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await pageCtx();
  const { t, lang, user } = ctx;
  const q = await searchParams;
  const track = sp(q.track) ?? 'ALL', tier = sp(q.tier) ?? 'ALL';
  const rows = await sql`
    SELECT s.*, o.name_en AS org_name, (SELECT count(*) FROM signal_sources WHERE signal_id = s.id)::int AS n
    FROM signals s LEFT JOIN organisations o ON o.id = s.org_id
    WHERE TRUE ${seesEverything(user) ? sql`` : sql`AND s.country = ANY(${user.countries})`}
    ${track !== 'ALL' ? sql`AND s.track = ${track}` : sql``} ${tier !== 'ALL' ? sql`AND s.tier = ${tier}` : sql``}
    ORDER BY s.first_seen_at DESC LIMIT 200`;
  const [stats] = await sql`SELECT count(*)::int AS signals, (SELECT count(*)::int FROM snapshots) AS snaps, (SELECT count(*)::int FROM sources WHERE enabled) AS sources, (SELECT count(*)::int FROM snapshots WHERE lang = 'ar') AS ar FROM signals`;
  return (
    <Shell ctx={ctx} active="signals">
      <PageHeader title={t('signals.title')} subtitle={`${stats.signals} signals · ${stats.snaps} snapshots (${stats.ar} Arabic) · ${stats.sources} sources enabled`}
        actions={<>
          <Link href="/signals/new" className="btn-primary">{t('signals.add')}</Link>
          {can(user, 'admin') && <form action={runIngestion}><button className="btn-ghost">{t('signals.runNow')}</button></form>}
        </>} />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <Select name="track" value={track} label={t('common.track')} options={[['ALL', t('tracks.ALL')], ...(['enterprise', 'smb', 'competitor', 'against'] as const).map((k) => [k, t(`tracks.${k}`)] as [string, string])]} />
        <Select name="tier" value={tier} label="Tier" options={[['ALL', t('common.all')], ['leader', t('tiers.leader')], ['team', t('tiers.team')], ['watchlist', t('tiers.watchlist')]]} />
        <button className="btn-ghost">{t('common.apply')}</button>
      </form>
      <Card>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>{t('common.title')}</th><th>{t('common.type')}</th><th>{t('scores.total')}</th><th>{t('common.sources')}</th><th>{t('common.date')}</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="max-w-md"><Link href={`/signals/${s.id}`} className="font-medium hover:underline" dir={s.lang === 'ar' ? 'rtl' : 'ltr'}>{s.title}</Link>
                      {s.title_en && s.lang === 'ar' && <div className="text-xs text-ink-3" dir="ltr">{s.title_en}</div>}
                      <div className="mt-1 flex flex-wrap gap-1">{s.org_name && <span className="chip bg-surface-2">{s.org_name}</span>}{s.is_demo && <DemoTag t={t} />}</div></td>
                    <td className="text-xs">{t(`signalTypes.${s.signal_type}`)}<div className="text-ink-3">{t(`tracks.${s.track}`)}</div></td>
                    <td><div className="font-num font-semibold">{s.total}</div><TierBadge tier={s.tier} t={t} /></td>
                    <td><ConfBadge c={s.confidence} t={t} /><div className="mt-1 text-xs text-ink-3">{s.n}</div></td>
                    <td className="whitespace-nowrap text-xs text-ink-3">{date(s.published_at ?? s.first_seen_at, lang)}</td>
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
