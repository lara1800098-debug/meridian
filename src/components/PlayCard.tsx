import Link from 'next/link';
import type { Ctx } from '@/lib/ctx';
import { money, date } from '@/lib/format';
import { ConfBadge, DemoTag, TierBadge } from './ui';

export function PlayRow({ p, ctx, compact }: { p: any; ctx: Ctx; compact?: boolean }) {
  const { t, lang, fx, cur } = ctx;
  const headline = lang === 'ar' ? p.headline_ar ?? p.headline : p.headline;
  return (
    <Link href={`/plays/${p.id}`} className="group flex items-start gap-3 rounded-ctl border border-transparent px-2 py-2.5 hover:border-line hover:bg-surface-2">
      <div className="font-num mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-primary/10 text-sm font-semibold text-brand-primary dark:text-ink" aria-label={`${t('scores.total')} ${p.total}`}>{p.total}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink group-hover:underline">{headline}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          <span>{t(`signalTypes.${p.signal_type}`)}</span>
          <span aria-hidden>·</span>
          <span>{t(`countries.${p.country}`)}</span>
          {!compact && <><span aria-hidden>·</span><span>{t(`sectors.${p.sector}`)}</span></>}
          {p.value_high_usd && <><span aria-hidden>·</span><span className="font-num">{money(Number(p.value_low_usd), cur, fx, lang)}–{money(Number(p.value_high_usd), cur, fx, lang).replace(/^\w+ /, '')}</span></>}
          {p.published_at && <><span aria-hidden>·</span><span>{date(p.published_at, lang)}</span></>}
          {p.n_sources > 1 && <><span aria-hidden>·</span><span>{t('signals.corroborated', { n: p.n_sources })}</span></>}
          {compact && p.is_demo && <DemoTag t={t} />}
        </div>
      </div>
      {!compact && <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex"><TierBadge tier={p.tier} t={t} /><ConfBadge c={p.confidence} t={t} />{p.is_demo && <DemoTag t={t} />}</div>}
    </Link>
  );
}
