import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, ConfBadge, DemoTag, FactTag, PageHeader, ScoreBars, TierBadge } from '@/components/ui';
import { sql } from '@/db';
import { date, money } from '@/lib/format';
import { seesEverything } from '@/lib/rbac';
import { aiAvailable } from '@/lib/ai/client';
import { translateSnapshot } from '../actions';

export default async function SignalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const { t, lang, user, fx, cur, hijri, tz } = ctx;
  const [s] = await sql`SELECT s.*, o.name_en AS org_name, o.id AS org_id FROM signals s LEFT JOIN organisations o ON o.id = s.org_id WHERE s.id = ${id}
    ${seesEverything(user) ? sql`` : sql`AND s.country = ANY(${user.countries})`}`;
  if (!s) notFound();
  const snaps = await sql`SELECT sn.*, src.name AS source_name, src.quality FROM signal_sources ss JOIN snapshots sn ON sn.id = ss.snapshot_id LEFT JOIN sources src ON src.id = sn.source_id WHERE ss.signal_id = ${id} ORDER BY sn.published_at NULLS LAST`;
  const [play] = await sql`SELECT id, status FROM plays WHERE signal_id = ${id}`;
  const deals = await sql`SELECT d.id, d.title FROM deal_signals ds JOIN deals d ON d.id = ds.deal_id WHERE ds.signal_id = ${id}`;
  const ex = s.extracted ?? {};
  return (
    <Shell ctx={ctx} active="signals">
      <div className="mb-2 text-sm"><Link href="/signals" className="text-ink-3 hover:underline">← {t('signals.title')}</Link></div>
      <PageHeader title={<span dir={s.lang === 'ar' ? 'rtl' : 'ltr'}>{s.title}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-2"><TierBadge tier={s.tier} t={t} /><ConfBadge c={s.confidence} t={t} />{s.is_demo && <DemoTag t={t} />}<span>{t(`signalTypes.${s.signal_type}`)} · {t(`tracks.${s.track}`)}</span></span>}
        actions={play ? <Link className="btn-primary" href={`/plays/${play.id}`}>{t('nav.plays')} →</Link> : undefined} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {snaps.map((sn, i) => (
            <Card key={sn.id} id={`snap-${sn.id}`} title={<span className="flex items-center gap-2"><span className="font-num text-ink-3">[{i + 1}]</span> {t('signals.snapshot')} <FactTag t={t} /></span>}
              action={aiAvailable() && !sn.title_translated && <form action={translateSnapshot.bind(null, sn.id, id)}><button className="btn-ghost text-xs">{t('common.translation')}</button></form>}>
              <div className="grid gap-4 md:grid-cols-2">
                <div dir={sn.lang === 'ar' ? 'rtl' : 'ltr'} lang={sn.lang}>
                  <div className="label">{t('common.original')} ({sn.lang.toUpperCase()})</div>
                  <div className="font-medium">{sn.title}</div>
                  <p className="mt-2 text-sm text-ink-2">{sn.excerpt}</p>
                </div>
                <div dir={sn.lang === 'ar' ? 'ltr' : 'rtl'} lang={sn.lang === 'ar' ? 'en' : 'ar'}>
                  <div className="label">{t('common.machineTranslation')}</div>
                  {sn.title_translated ? <><div className="font-medium">{sn.title_translated}</div><p className="mt-2 text-sm text-ink-2">{sn.excerpt_translated}</p></> : <p className="muted">{aiAvailable() ? '—' : t('common.aiOff')}</p>}
                </div>
              </div>
              {sn.body && <details className="mt-3"><summary className="cursor-pointer text-xs text-brand-a1">Full stored text</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-surface-2 p-3 text-xs" dir="auto">{sn.body.slice(0, 20000)}</pre></details>}
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-3 sm:grid-cols-4">
                <div><dt>{t('common.source')}</dt><dd className="text-ink-2">{sn.source_name ?? sn.origin}</dd></div>
                <div><dt>{t('signals.published')}</dt><dd className="text-ink-2">{date(sn.published_at, lang, tz, hijri)}</dd></div>
                <div><dt>{t('signals.fetched')}</dt><dd className="text-ink-2">{date(sn.fetched_at, lang, tz, hijri)}</dd></div>
                <div><dt>Hash</dt><dd className="truncate font-mono text-ink-2" title={sn.content_hash}>{sn.content_hash.slice(0, 12)}…</dd></div>
              </dl>
              {!sn.url.startsWith('upload://') && <a href={sn.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block break-all text-xs text-brand-a1 underline" dir="ltr">{sn.url}</a>}
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card title={`${t('scores.total')}: ${s.total}`}><ScoreBars scores={Object.fromEntries(Object.entries(s.scores ?? {}).map(([k, v]: any) => [k, { score: v.score, why: v.why[lang] ?? v.why.en }]))} t={t} /></Card>
          <Card title={t('signals.extracted')}>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-ink-3">{t('signals.orgs')}</dt><dd>{(ex.orgNames ?? []).join(' · ') || t('common.unknown')}</dd></div>
              {s.org_id && <div><dt className="text-xs text-ink-3">{t('nav.orgs')}</dt><dd><Link className="hover:underline" href={`/orgs/${s.org_id}`}>{s.org_name}</Link></dd></div>}
              <div><dt className="text-xs text-ink-3">{t('signals.amount')}</dt><dd>{ex.amountText ? `${ex.amountText} (≈ ${money(Number(s.amount_usd), cur, fx, lang)})` : t('common.unknown')}</dd></div>
              <div><dt className="text-xs text-ink-3">{t('signals.deadline')}</dt><dd>{s.deadline ? date(s.deadline, lang, tz, hijri) : t('common.unknown')}</dd></div>
              <div><dt className="text-xs text-ink-3">{t('common.country')} / {t('common.sector')}</dt><dd>{t(`countries.${s.country}`)} / {t(`sectors.${s.sector}`)}</dd></div>
              {ex.competitors?.length > 0 && <div><dt className="text-xs text-ink-3">{t('admin.competitors')}</dt><dd>{ex.competitors.join(', ')}</dd></div>}
              <div><dt className="text-xs text-ink-3">Evidence</dt><dd className="text-xs">{(ex.matched ?? []).map((m: string, i: number) => <q key={i} className="me-2 block">{m}</q>)}</dd></div>
              <div><dt className="text-xs text-ink-3">{t('signals.method')}</dt><dd>{s.classification_method === 'ai' ? t('common.ai') : t('common.rules')}</dd></div>
            </dl>
          </Card>
          {deals.length > 0 && <Card title={t('deals.title')}><ul className="text-sm">{deals.map((d) => <li key={d.id}><Link className="hover:underline" href={`/deals/${d.id}`}>{d.title}</Link></li>)}</ul></Card>}
        </div>
      </div>
    </Shell>
  );
}
