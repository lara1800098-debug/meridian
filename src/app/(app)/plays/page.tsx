import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, Empty, PageHeader, Select } from '@/components/ui';
import { PlayRow } from '@/components/PlayCard';
import { sql } from '@/db';
import { playScope } from '@/lib/data/deals';
import { COUNTRIES, SECTORS } from '@/lib/taxonomy';
import { sp } from '@/lib/view';

export default async function Plays({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const ctx = await pageCtx();
  const { t, user } = ctx;
  const q = await searchParams;
  const f = { track: sp(q.track) ?? 'ALL', country: sp(q.country) ?? 'ALL', sector: sp(q.sector) ?? 'ALL', tier: sp(q.tier) ?? (user.role === 'executive' ? 'leader' : 'ALL'), status: sp(q.status) ?? 'new', owner: sp(q.owner) ?? 'ALL', min: Number(sp(q.min) ?? 0) };
  const owners = await sql`SELECT id, name FROM users WHERE active AND role IN ('ae','bdr','director') ORDER BY name`;
  const plays = await sql`
    SELECT p.*, s.signal_type, s.country, s.sector, s.track, s.is_demo,
      (SELECT count(*) FROM signal_sources WHERE signal_id = s.id)::int AS n_sources,
      (SELECT min(sn.published_at) FROM signal_sources ss JOIN snapshots sn ON sn.id = ss.snapshot_id WHERE ss.signal_id = s.id) AS published_at
    FROM plays p JOIN signals s ON s.id = p.signal_id
    WHERE ${playScope(user)}
      AND (p.status = ${f.status} OR (${f.status} = 'new' AND p.status = 'snoozed' AND p.snooze_until <= current_date))
      ${f.track !== 'ALL' ? sql`AND s.track = ${f.track}` : sql``}
      ${f.country !== 'ALL' ? sql`AND s.country = ${f.country}` : sql``}
      ${f.sector !== 'ALL' ? sql`AND s.sector = ${f.sector}` : sql``}
      ${f.tier !== 'ALL' ? sql`AND p.tier = ${f.tier}` : sql``}
      ${f.owner === 'me' ? sql`AND p.owner_id = ${user.id}` : f.owner !== 'ALL' ? sql`AND p.owner_id = ${f.owner}` : sql``}
      AND p.total >= ${f.min}
    ORDER BY p.total DESC, p.created_at DESC LIMIT 200`;
  const byCountry = await sql`SELECT s.country, count(*)::int AS n FROM plays p JOIN signals s ON s.id = p.signal_id WHERE ${playScope(user)} AND p.status = 'new' GROUP BY 1 ORDER BY 2 DESC`;
  return (
    <Shell ctx={ctx} active="plays">
      <PageHeader title={t('plays.inbox')} subtitle={t('plays.count', { n: plays.length })} />
      <form className="card mb-4 grid grid-cols-2 gap-3 p-4 md:grid-cols-4 lg:grid-cols-8" aria-label={t('common.filter')}>
        <Select name="track" value={f.track} label={t('common.track')} options={[['ALL', t('tracks.ALL')], ['enterprise', t('tracks.enterprise')], ['smb', t('tracks.smb')], ['competitor', t('tracks.competitor')]]} />
        <Select name="country" value={f.country} label={t('common.country')} options={[['ALL', t('countries.ALL')], ...COUNTRIES.map((c) => [c, t(`countries.${c}`)] as [string, string])]} />
        <Select name="sector" value={f.sector} label={t('common.sector')} options={[['ALL', t('sectors.ALL')], ...SECTORS.map((s) => [s, t(`sectors.${s}`)] as [string, string])]} />
        <Select name="tier" value={f.tier} label="Tier" options={[['ALL', t('common.all')], ['leader', t('tiers.leader')], ['team', t('tiers.team')], ['watchlist', t('tiers.watchlist')]]} />
        <Select name="owner" value={f.owner} label={t('common.owner')} options={[['ALL', t('common.all')], ['me', '→ me'], ...owners.map((o) => [o.id, o.name] as [string, string])]} />
        <Select name="status" value={f.status} label={t('common.status')} options={(['new', 'accepted', 'snoozed', 'dismissed'] as const).map((s) => [s, t(`plays.status.${s}`)])} />
        <label className="block"><span className="label">{t('scores.total')} ≥</span><input className="input" type="number" name="min" min={0} max={100} defaultValue={f.min} /></label>
        <div className="flex items-end"><button className="btn-primary w-full">{t('common.apply')}</button></div>
      </form>
      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <Card>{plays.length ? <div className="divide-y divide-line">{plays.map((p) => <PlayRow key={p.id} p={p} ctx={ctx} />)}</div> : <Empty>{t('plays.empty')}</Empty>}</Card>
        <Card title={t('cockpit.byCountry')}>
          <ul className="space-y-2 text-sm">
            {byCountry.map((r) => (
              <li key={r.country}><a className="flex justify-between hover:underline" href={`?country=${r.country}`}><span>{t(`countries.${r.country}`)}</span><span className="font-num font-medium">{r.n}</span></a></li>
            ))}
          </ul>
        </Card>
      </div>
    </Shell>
  );
}
