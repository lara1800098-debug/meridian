import { notFound } from 'next/navigation';
import { pageCtx } from '@/lib/ctx';
import { sql } from '@/db';
import { playScope } from '@/lib/data/deals';
import PrintFrame from '../../PrintFrame';
import { date, money } from '@/lib/format';

export default async function PrintPlay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t, lang, user, cur, fx } = await pageCtx();
  const [p] = await sql`SELECT p.*, s.id AS sid, s.signal_type, s.country, s.sector FROM plays p JOIN signals s ON s.id = p.signal_id WHERE p.id = ${id} AND ${playScope(user)}`;
  if (!p) notFound();
  const sources = await sql`SELECT sn.* FROM signal_sources ss JOIN snapshots sn ON sn.id = ss.snapshot_id WHERE ss.signal_id = ${p.sid}`;
  const offers = await sql`SELECT * FROM offers WHERE key = ANY(${p.offer_keys})`;
  const o = p.outreach?.[lang];
  return (
    <PrintFrame t={t} lang={lang} title={t('nav.plays')} subtitle={`${t(`signalTypes.${p.signal_type}`)} · ${t(`countries.${p.country}`)}`}>
      <h1 className="text-lg font-semibold">{lang === 'ar' ? p.headline_ar ?? p.headline : p.headline}</h1>
      <p className="text-xs text-ink-3">{t('scores.total')} {p.total} · {t(`tiers.${p.tier}`)} · {t('common.confidence')}: {t(`common.${p.confidence}`)} · {money(Number(p.value_low_usd), cur, fx, lang)}–{money(Number(p.value_high_usd), cur, fx, lang)} ({t('common.indicative')})</p>
      <h2 className="mt-4 font-semibold">{t('plays.whyNow')}</h2>
      <ul className="list-disc ps-5">{p.why_now.map((w: any, i: number) => <li key={i}>{w[lang] ?? w.en} <span className="text-ink-3">[{sources.findIndex((s) => s.id === w.snapshotId) + 1}]</span></li>)}</ul>
      <h2 className="mt-4 font-semibold">{t('plays.offers')}</h2>
      <ul className="list-disc ps-5">{offers.map((x) => <li key={x.key}>{lang === 'ar' ? x.name_ar : x.name_en} — {lang === 'ar' ? x.pitch_ar : x.pitch_en}</li>)}</ul>
      <h2 className="mt-4 font-semibold">{t('scores.total')}</h2>
      <ul className="ps-1">{Object.entries(p.scores).map(([k, v]: any) => <li key={k}><b>{t(`scores.${k}`)} {v.score}</b> — {v.why[lang] ?? v.why.en}</li>)}</ul>
      <h2 className="mt-4 font-semibold">{t('plays.risks')}</h2>
      <ul className="list-disc ps-5">{p.risks.map((r: any, i: number) => <li key={i}>{r[lang] ?? r.en}</li>)}</ul>
      {o && <><h2 className="mt-4 font-semibold">{t('plays.email')}</h2><pre className="whitespace-pre-wrap font-sans">{o.email.subject}{'\n\n'}{o.email.body}</pre></>}
      <h2 className="mt-4 font-semibold">{t('common.sources')}</h2>
      <ol className="list-decimal ps-5 text-[11px]">{sources.map((s) => <li key={s.id}>{s.title} — {s.url.startsWith('upload://') ? s.url : new URL(s.url).hostname} · {date(s.published_at ?? s.fetched_at, lang)}</li>)}</ol>
    </PrintFrame>
  );
}
