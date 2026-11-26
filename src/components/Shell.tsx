import Link from 'next/link';
import { brandLogo } from '@/lib/brand';
import { can } from '@/lib/rbac';
import type { Ctx } from '@/lib/ctx';
import { setCurrency, setLang, setTheme, toggleHijri } from '@/app/actions/prefs';
import { CURRENCIES } from '@/lib/taxonomy';
import { sql } from '@/db';

export async function Lockup({ lang, theme, t }: { lang: string; theme: 'light' | 'dark'; t: Ctx['t'] }) {
  const logo = brandLogo(theme);
  return (
    <div className="flex items-center gap-3">
      {logo ? <img src={logo} alt="Concentrix" className="h-7 w-auto" /> : <span className="rounded border border-dashed border-ink-3 px-2 py-1 text-[11px] font-semibold tracking-wide text-ink-2">{t('app.logoPlaceholder')}</span>}
      <span className="h-6 w-px bg-line" aria-hidden />
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-ink" dir="ltr">Meridian</span>
        <span className="block text-[11px] text-ink-3">{t('app.descriptor')}</span>
      </span>
    </div>
  );
}

export default async function Shell({ ctx, active, children }: { ctx: Ctx; active: string; children: React.ReactNode }) {
  const { user, t, cur, lang, hijri } = ctx;
  const [{ n: unread }] = await sql`SELECT count(*)::int AS n FROM notifications WHERE user_id = ${user.id} AND read_at IS NULL`;
  const items: [string, string, boolean][] = [
    ['cockpit', '/', can(user, 'cockpit')],
    ['brief', '/brief', can(user, 'brief')],
    ['plays', '/plays', true],
    ['deals', '/deals', true],
    ['forecast', '/forecast', can(user, 'forecast')],
    ['review', '/review', can(user, 'review')],
    ['signals', '/signals', true],
    ['orgs', '/orgs', true],
    ['tenders', '/tenders', can(user, 'tenders')],
    ['sizer', '/sizer', true],
    ['access', '/access', true],
    ['events', '/events', true],
    ['admin', '/admin', can(user, 'admin')],
  ];
  const nav = items.filter((i) => i[2]);
  const demo = process.env.DEMO_MODE === '1';
  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>
      <aside className="no-print hidden w-60 shrink-0 border-e border-line bg-surface lg:block">
        <div className="sticky top-0 flex h-screen flex-col p-4">
          <Lockup lang={lang} theme={user.theme} t={t} />
          <nav className="mt-6 flex-1 space-y-0.5 overflow-y-auto" aria-label="Main">
            {nav.map(([k, href]) => (
              <Link key={k} href={href} aria-current={active === k ? 'page' : undefined}
                className={`block rounded-ctl px-3 py-2 text-sm ${active === k ? 'bg-brand-primary/10 font-medium text-brand-primary dark:text-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
                {t(`nav.${k}`)}
              </Link>
            ))}
          </nav>
          <div className="border-t border-line pt-3 text-xs text-ink-3">
            <div className="font-medium text-ink-2">{user.name}</div>
            <div>{t(`roles.${user.role}`)}</div>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div className="lg:hidden"><Lockup lang={lang} theme={user.theme} t={t} /></div>
            <form action="/search" className="hidden flex-1 md:block md:max-w-md">
              <input name="q" className="input" placeholder={t('common.search') + '…'} aria-label={t('common.search')} />
            </form>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <form action={setCurrency} className="flex">
                <select name="cur" defaultValue={cur} className="input !w-auto !py-1.5 text-xs" aria-label={t('common.currency')}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <button className="btn-ghost !px-2 !py-1 text-xs ms-1">✓</button>
              </form>
              <form action={setLang.bind(null, lang === 'ar' ? 'en' : 'ar')}><button className="btn-ghost !px-2.5 !py-1.5 text-xs" aria-label={t('common.language')}>{lang === 'ar' ? 'EN' : 'ع'}</button></form>
              <form action={setTheme.bind(null, user.theme === 'dark' ? 'light' : 'dark')}><button className="btn-ghost !px-2.5 !py-1.5 text-xs" aria-label={t('common.theme')}>{user.theme === 'dark' ? '☀' : '☾'}</button></form>
              <form action={toggleHijri}><button className={`btn-ghost !px-2.5 !py-1.5 text-xs ${hijri ? '!border-brand-a1' : ''}`} title={t('common.hijri')} aria-pressed={hijri}>هـ</button></form>
              <Link href="/notifications" className="btn-ghost relative !px-2.5 !py-1.5 text-xs" aria-label={t('nav.notifications')}>
                🔔{unread > 0 && <span className="absolute -top-1 -end-1 rounded-full bg-bad px-1.5 text-[10px] text-white">{unread}</span>}
              </Link>
              <Link href="/me" className="btn-ghost hidden !px-2.5 !py-1.5 text-xs sm:inline-flex">{t('nav.profile')}</Link>
              <form action="/logout" method="post"><button className="btn-ghost !px-2.5 !py-1.5 text-xs">{t('nav.logout')}</button></form>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden" aria-label="Main mobile">
            {nav.map(([k, href]) => (
              <Link key={k} href={href} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${active === k ? 'bg-brand-primary text-brand-primary-fg' : 'bg-surface-2 text-ink-2'}`}>{t(`nav.${k}`)}</Link>
            ))}
          </nav>
        </header>
        {demo && <div className="no-print bg-warn/15 px-4 py-1.5 text-center text-xs font-medium text-warn">{t('app.demoBanner')}</div>}
        <main id="main" className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
