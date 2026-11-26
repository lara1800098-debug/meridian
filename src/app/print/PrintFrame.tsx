import { Lockup } from '@/components/Shell';
import type { T } from '@/i18n';

export default async function PrintFrame({ t, lang, title, subtitle, children }: { t: T; lang: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[190mm] bg-white p-2 text-[13px] text-ink" style={{ colorScheme: 'light' }}>
      <header className="mb-3 flex items-center justify-between border-b-2 border-brand-primary pb-3">
        <Lockup lang={lang} theme="light" t={t} />
        <div className="text-end"><div className="text-base font-semibold">{title}</div>{subtitle && <div className="text-xs text-ink-3">{subtitle}</div>}</div>
      </header>
      {process.env.DEMO_MODE === '1' && <div className="mb-3 rounded bg-warn/15 px-2 py-1 text-center text-[11px] font-medium text-warn">{t('app.demoBanner')}</div>}
      {children}
      <footer className="mt-4 border-t border-line pt-2 text-[10px] text-ink-3">Concentrix — internal use only · Meridian · {new Date().toISOString().slice(0, 10)} · Facts link to stored source snapshots in Meridian; suggestions are recommendations.</footer>
    </div>
  );
}
