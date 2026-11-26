import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, ConfBadge, DemoTag, FactTag, PageHeader, ScoreBars, SourceRef, SuggestTag, TierBadge } from '@/components/ui';
import { CopyButton, Tabs } from '@/components/client';
import { sql } from '@/db';
import { playScope } from '@/lib/data/deals';
import { date, money, daysBetween } from '@/lib/format';
import { BUYER_ROLES_AR, DISMISS_REASONS } from '@/lib/taxonomy';
import { acceptPlay, assignPlay, dismissPlay, regenerateOutreach, snoozePlay } from '../actions';
import { aiAvailable } from '@/lib/ai/client';
import { getSettings } from '@/lib/settings';
import { can } from '@/lib/rbac';

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const { t, lang, fx, cur, user, hijri } = ctx;
  const [p] = await sql`
    SELECT p.*, s.id AS sid, s.title AS signal_title, s.title_en, s.signal_type, s.country, s.sector, s.track, s.lang AS s_lang, s.classification_method, o.name_en AS org_name, o.name_ar AS org_name_ar, o.org_type, ow.name AS owner_name
    FROM plays p JOIN signals s ON s.id = p.signal_id LEFT JOIN organisations o ON o.id = p.org_id LEFT JOIN users ow ON ow.id = p.owner_id
    WHERE p.id = ${id} AND ${playScope(user)}`;
  if (!p) notFound();
  const settings = await getSettings();
  const sources = await sql`SELECT sn.*, src.name AS source_name FROM signal_sources ss JOIN snapshots sn ON sn.id = ss.snapshot_id LEFT JOIN sources src ON src.id = sn.source_id WHERE ss.signal_id = ${p.sid} ORDER BY sn.published_at NULLS LAST`;
  const offers = await sql`SELECT * FROM offers WHERE key = ANY(${p.offer_keys})`;
  const paths = p.org_id ? await sql`SELECT r.*, u.name AS knower FROM relationships r JOIN users u ON u.id = r.user_id WHERE r.org_id = ${p.org_id} AND (${can(user, 'access.view_all')} OR r.user_id = ${user.id}) ORDER BY CASE r.strength WHEN 'strong' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END` : [];
  const owners = await sql`SELECT id, name FROM users WHERE active AND role IN ('ae','bdr','director') ORDER BY name`;
  const snapIdx = new Map(sources.map((s, i) => [s.id, i + 1]));
  const proof = p.proof_point ? JSON.parse(p.proof_point) : null;
  const oldest = sources[0]?.published_at;
  const stale = oldest && daysBetween(oldest) > settings.staleDays;
  const o = p.outreach?.[lang] ?? p.outreach?.en;
  const other = p.outreach?.[lang === 'ar' ? 'en' : 'ar'];
  const outreachBlock = (x: any, l: 'en' | 'ar') => x && (
    <div dir={l === 'ar' ? 'rtl' : 'ltr'} lang={l} className={`space-y-4 ${l === 'ar' ? 'font-ar' : ''}`}>
      {([['email', `${x.email.subject}\n\n${x.email.body}`], ['note', x.note], ['opener', x.opener], ['followups', x.followups.join('\n\n')]] as const).map(([k, text]) => (
        <div key={k}>
          <div className="mb-1 flex items-center justify-between"><span className="label !mb-0">{t(`plays.${k}`)}</span><CopyButton text={text} label={t('common.copy')} done={t('common.copied')} /></div>
          <pre className="whitespace-pre-wrap rounded-ctl bg-surface-2 p-3 font-sans text-sm leading-relaxed">{text}</pre>
        </div>
      ))}
    </div>
  );
  return (
    <Shell ctx={ctx} active="plays">
      <div className="mb-2 text-sm"><Link href="/plays" className="text-ink-3 hover:underline">← {t('plays.inbox')}</Link></div>
      <PageHeader
        title={lang === 'ar' ? p.headline_ar ?? p.headline : p.headline}
        subtitle={<span className="flex flex-wrap items-center gap-2"><TierBadge tier={p.tier} t={t} /><ConfBadge c={p.confidence} t={t} />{p.is_demo && <DemoTag t={t} />}{stale && <span className="chip bg-warn/15 text-warn">{t('common.stale')}</span>}<span>{t(`signalTypes.${p.signal_type}`)} · {t(`countries.${p.country}`)} · {t(`sectors.${p.sector}`)}</span></span>}
        actions={p.status === 'new' || p.status === 'snoozed' ? (
          <>
            <form action={acceptPlay.bind(null, p.id)}><button className="btn-primary">{t('plays.accept')}</button></form>
            <form action={snoozePlay.bind(null, p.id)}><button className="btn-ghost">{t('plays.snooze')}</button></form>
            <a className="btn-ghost" href={`/api/pdf?p=/print/play/${p.id}`}>{t('common.exportPdf')}</a>
          </>
        ) : p.deal_id ? <Link className="btn-primary" href={`/deals/${p.deal_id}`}>{t('plays.accepted')} →</Link> : <span className="chip bg-surface-2">{t(`plays.status.${p.status}`)}</span>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={<span className="flex items-center gap-2">{t('plays.whyNow')} <FactTag t={t} /></span>}>
            <ul className="space-y-2 text-sm">
              {p.why_now.map((w: any, i: number) => {
                const s = sources.find((x) => x.id === w.snapshotId);
                return <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-a1" /><span>{w[lang] ?? w.en} {s && <SourceRef n={snapIdx.get(s.id)} href={`/signals/${p.sid}#snap-${s.id}`} title={s.source_name ?? s.url} date={date(s.published_at ?? s.fetched_at, lang, ctx.tz, hijri)} />}</span></li>;
              })}
            </ul>
            {p.org_name && <p className="mt-3 text-sm"><span className="text-ink-3">{t('nav.orgs')}:</span> <Link className="font-medium hover:underline" href={`/orgs/${p.org_id}`}>{lang === 'ar' ? p.org_name_ar ?? p.org_name : p.org_name}</Link></p>}
          </Card>

          <Card title={<span className="flex items-center gap-2">{t('plays.offers')} <SuggestTag t={t} /></span>}>
            <div className="grid gap-3 sm:grid-cols-2">
              {offers.map((of) => (
                <div key={of.key} className="rounded-ctl border border-line p-3">
                  <div className="text-sm font-medium">{lang === 'ar' ? of.name_ar : of.name_en}</div>
                  <p className="mt-1 text-sm text-ink-2">{lang === 'ar' ? of.pitch_ar : of.pitch_en}</p>
                </div>
              ))}
              {!offers.length && <p className="muted">{t('common.none')}</p>}
            </div>
            {proof && <p className="mt-3 text-sm"><span className="font-medium">{t('plays.proof')}:</span> {proof.text} <a className="text-xs text-brand-a1 underline" href={proof.url} target="_blank" rel="noreferrer">{t('common.source')}</a></p>}
            <p className="mt-3 text-sm"><span className="font-medium">{t('plays.buyers')}:</span> {p.buyer_roles.map((r: string) => (lang === 'ar' ? BUYER_ROLES_AR[r] ?? r : r)).join(' · ')}</p>
          </Card>

          <Card title={t('plays.outreach')} action={aiAvailable() && <form action={regenerateOutreach.bind(null, p.id)}><button className="btn-ghost text-xs">{t('plays.regenerate')}</button></form>}>
            <p className="mb-3 text-xs text-ink-3">{t('common.generatedBy')}: {p.outreach_method === 'ai' ? t('common.ai') : t('common.template')} · <SuggestTag t={t} /></p>
            <Tabs tabs={[
              { id: lang, label: lang === 'ar' ? 'العربية' : 'English', content: outreachBlock(o, lang) },
              { id: lang === 'ar' ? 'en' : 'ar', label: lang === 'ar' ? 'English' : 'العربية', content: outreachBlock(other, lang === 'ar' ? 'en' : 'ar') },
            ]} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={`${t('scores.total')}: ${p.total}`}>
            <ScoreBars scores={Object.fromEntries(Object.entries(p.scores).map(([k, v]: any) => [k, { score: v.score, why: v.why[lang] ?? v.why.en }]))} t={t} />
          </Card>
          <Card title={t('plays.value')}>
            <div className="font-num text-xl font-semibold">{money(Number(p.value_low_usd), cur, fx, lang)} – {money(Number(p.value_high_usd), cur, fx, lang)}</div>
            <p className="mt-1 text-xs text-ink-3">{p.size_band} · {t('common.indicative')}</p>
          </Card>
          <Card title={t('plays.risks')}>
            <ul className="list-disc space-y-1 ps-4 text-sm text-ink-2">{p.risks.map((r: any, i: number) => <li key={i}>{r[lang] ?? r.en}</li>)}</ul>
          </Card>
          <Card title={t('plays.bestPath')}>
            {paths.length ? <ul className="space-y-2 text-sm">{paths.slice(0, 4).map((r) => <li key={r.id}><span className="font-medium">{r.knower}</span> → {r.person_name}{r.person_title ? `, ${r.person_title}` : ''} <span className="chip bg-surface-2">{t(`access.${r.strength}`)}</span></li>)}</ul> : <p className="muted">{t('plays.noPath')}</p>}
          </Card>
          {(p.status === 'new' || p.status === 'snoozed') && (
            <Card title={t('common.actions')}>
              <form action={assignPlay.bind(null, p.id)} className="flex gap-2">
                <select name="owner" defaultValue={p.owner_id ?? ''} className="input" aria-label={t('plays.assign')}>{owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                <button className="btn-ghost">{t('plays.assign')}</button>
              </form>
              <form action={dismissPlay.bind(null, p.id)} className="mt-3 flex gap-2">
                <select name="reason" required className="input" aria-label={t('plays.dismissReason')} defaultValue=""><option value="" disabled>{t('plays.dismissReason')}</option>{DISMISS_REASONS.map((r) => <option key={r} value={r}>{t(`plays.dismissReasons.${r}`)}</option>)}</select>
                <button className="btn-danger">{t('plays.dismiss')}</button>
              </form>
              <p className="mt-3 text-xs text-ink-3">{t('plays.owner')}: {p.owner_name ?? '—'}</p>
            </Card>
          )}
          <Card title={t('common.sources')}>
            <ol className="space-y-2 text-xs">{sources.map((s, i) => <li key={s.id}><span className="font-num text-ink-3">[{i + 1}]</span> <Link className="hover:underline" href={`/signals/${p.sid}#snap-${s.id}`}>{s.title}</Link> <span className="text-ink-3">— {s.source_name ?? new URL(s.url).hostname} · {date(s.published_at ?? s.fetched_at, lang)}</span></li>)}</ol>
            <p className="mt-2 text-xs text-ink-3">{t('signals.method')}: {p.classification_method === 'ai' ? t('common.ai') : t('common.rules')}</p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
