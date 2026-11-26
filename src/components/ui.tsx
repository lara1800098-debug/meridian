import Link from 'next/link';
import clsx from 'clsx';
import type { T } from '@/i18n';

export function Card({ title, action, children, className, id }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={clsx('card min-w-0 p-4 sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="h2">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, tone, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'warn' | 'bad'; href?: string }) {
  const body = (
    <div className={clsx('card h-full p-4 transition-shadow', href && 'hover:shadow-pop')}>
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className={clsx('font-num mt-1 text-2xl font-semibold tracking-tight', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn', tone === 'bad' && 'text-bad')}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-2">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

const tierCls: Record<string, string> = { leader: 'bg-brand-primary text-brand-primary-fg', team: 'bg-brand-a1/15 text-brand-a1', watchlist: 'bg-surface-2 text-ink-2' };
export const TierBadge = ({ tier, t }: { tier: string; t: T }) => <span className={clsx('chip', tierCls[tier])}>{t(`tiers.${tier}`)}</span>;

const healthCls: Record<string, string> = { healthy: 'bg-good/12 text-good', watch: 'bg-warn/15 text-warn', at_risk: 'bg-bad/12 text-bad' };
export const HealthBadge = ({ status, t }: { status: string; t: T }) => (
  <span className={clsx('chip', healthCls[status])}><span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />{t(`deals.${status}`)}</span>
);

export const ConfBadge = ({ c, t }: { c: string; t: T }) => (
  <span className={clsx('chip border', c === 'high' ? 'border-good/40 text-good' : c === 'medium' ? 'border-warn/40 text-warn' : 'border-line text-ink-3')}>
    {t('common.confidence')}: {t(`common.${c}`)}
  </span>
);

export const FactTag = ({ t }: { t: T }) => <span className="chip bg-info/10 text-info">{t('common.fact')}</span>;
export const SuggestTag = ({ t }: { t: T }) => <span className="chip bg-brand-a3/15 text-brand-a3">{t('common.suggestion')}</span>;
export const DemoTag = ({ t }: { t: T }) => <span className="chip bg-warn/15 text-warn">{t('app.demo')}</span>;

export function ScoreBars({ scores, t }: { scores: Record<string, { score: number; why: string }>; t: T }) {
  return (
    <dl className="space-y-2.5">
      {(['fit', 'intent', 'timing', 'access'] as const).map((k) => {
        const s = scores?.[k];
        if (!s) return null;
        return (
          <div key={k}>
            <div className="flex items-baseline justify-between text-xs">
              <dt className="font-medium text-ink-2">{t(`scores.${k}`)}</dt>
              <dd className="font-num font-semibold">{s.score}</dd>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.score} aria-label={t(`scores.${k}`)}>
              <div className="h-full rounded-full bg-brand-a1" style={{ width: `${s.score}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink-3">{s.why}</p>
          </div>
        );
      })}
    </dl>
  );
}

/** Every claim is clickable → source, date, confidence. Uses native <details> so it works without JS. */
export function SourceRef({ n, href, title, date, label }: { n?: number; href: string; title: string; date?: string; label?: string }) {
  return (
    <details className="relative inline-block align-baseline">
      <summary className="cursor-pointer list-none text-xs font-medium text-brand-a1 underline decoration-dotted underline-offset-2" aria-label={`Source: ${title}`}>
        {label ?? `[${n ?? 'src'}]`}
      </summary>
      <div className="absolute z-30 mt-1 w-72 rounded-ctl border border-line bg-surface p-3 text-xs shadow-pop start-0">
        <div className="font-medium text-ink">{title}</div>
        {date && <div className="mt-1 text-ink-3">{date}</div>}
        <Link href={href} className="mt-2 inline-block text-brand-a1 underline">Open snapshot →</Link>
      </div>
    </details>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-3">{children}</div>;
}

export function Select({ name, value, options, label, className }: { name: string; value?: string; options: [string, string][]; label?: string; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="label">{label}</span>}
      <select name={name} defaultValue={value} className="input">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function Field({ label, name, type = 'text', defaultValue, required, placeholder, step, className }: { label: string; name: string; type?: string; defaultValue?: string | number | null; required?: boolean; placeholder?: string; step?: string; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}{required && ' *'}</span>
      <input className="input" name={name} type={type} defaultValue={defaultValue ?? ''} required={required} placeholder={placeholder} step={step} />
    </label>
  );
}
