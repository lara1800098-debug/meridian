import Link from 'next/link';
import type { T } from '@/i18n';
import { money, date, type Fx } from '@/lib/format';

/** One-page brief, used both in-app and for the PDF. */
export function BriefView({ b, prev, t, lang, cur, fx, print }: { b: any; prev?: any; t: T; lang: 'en' | 'ar'; cur: string; fx: Fx; print?: boolean }) {
  const c = b.content;
  const m = (v: number) => money(v, cur, fx, lang);
  const delta = (k: string) => {
    if (!prev?.content?.forecast) return null;
    const d = Number(c.forecast[k]) - Number(prev.content.forecast[k]);
    if (!d) return null;
    return <span className={`ms-1 text-xs ${d > 0 ? 'text-good' : 'text-bad'}`}>{d > 0 ? '▲' : '▼'} {m(Math.abs(d))} {t('brief.vsLast')}</span>;
  };
  const L = ({ href, children }: { href: string; children: React.ReactNode }) => (print ? <span>{children}</span> : <Link href={href} className="hover:underline">{children}</Link>);
  return (
    <article className={print ? 'space-y-3 text-[12.5px]' : 'space-y-5'}>
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-a1">{t('brief.summary')}</h2>
        <ul className="space-y-1.5 text-[15px] leading-snug">{c.headline.map((h: string, i: number) => <li key={i} className="flex gap-2"><span className="font-num text-ink-3">{i + 1}.</span><span>{h}</span></li>)}</ul>
      </section>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([['realistic', t('forecast.realistic')], ['weighted', t('forecast.weighted')], ['target', t('forecast.target')], ['pipeline', t('cockpit.open')]] as const).map(([k, l]) => (
          <div key={k} className="rounded-ctl border border-line p-3"><div className="text-[11px] text-ink-3">{l} · {c.forecast.quarter}</div><div className="font-num text-lg font-semibold">{c.forecast[k] ? m(Number(c.forecast[k])) : '—'}</div>{delta(k)}</div>
        ))}
      </section>
      <p className="text-sm text-ink-2">{t('cockpit.coverage')}: <span className="font-num font-semibold">{c.forecast.coverage != null ? `${Number(c.forecast.coverage).toFixed(1)}×` : '—'}</span>{c.forecast.pctOfTarget != null && <> · {c.forecast.pctOfTarget}% {t('cockpit.ofTarget')}</>}</p>
      <div className="grid gap-5 sm:grid-cols-2">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-a1">{t('cockpit.topPlays')}</h2>
          <ol className="space-y-2 text-sm">{c.plays.length ? c.plays.map((p: any) => <li key={p.id}><L href={`/plays/${p.id}`}>{p.headline}</L><div className="text-xs text-ink-3"><span className="font-num">{p.score}</span> · {p.value[0]}–{p.value[1]}</div></li>) : <li className="muted">{t('common.none')}</li>}</ol>
        </section>
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-a1">{t('cockpit.topRisks')}</h2>
          <ol className="space-y-2 text-sm">{c.risks.length ? c.risks.map((d: any) => <li key={d.id}><L href={`/deals/${d.id}`}>{d.title}</L> <span className="font-num text-xs text-ink-3">{d.value}</span><div className="text-xs text-bad">{d.reasons.join(' · ')}</div></li>) : <li className="muted">✓</li>}</ol>
        </section>
      </div>
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-a1">{t('cockpit.marketMoves')}</h2>
        <ul className="space-y-1 text-sm">{c.moves.length ? c.moves.map((s: any) => <li key={s.id}><L href={`/signals/${s.id}`}>{s.title}</L> <span className="text-xs text-ink-3">— {t(`signalTypes.${s.type}`)}</span></li>) : <li className="muted">{t('common.none')}</li>}</ul>
      </section>
      <section className={`rounded-card border-2 border-brand-primary/30 bg-brand-primary/5 ${print ? 'p-3' : 'p-4'}`}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-primary dark:text-ink">{t('brief.decisions')} · <span className="normal-case">{t('common.suggestion')}</span></h2>
        <ol className="list-decimal space-y-1.5 ps-5 text-[15px]">{c.decisions.map((d: string, i: number) => <li key={i}>{d}</li>)}</ol>
      </section>
      <p className="text-[11px] text-ink-3">{t('common.generatedBy')}: {c.method === 'ai' ? t('common.ai') : t('common.template')} · {date(c.generatedAt, lang)} · {t('brief.readTime')}</p>
    </article>
  );
}
