import './globals.css';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { readSession } from '@/lib/auth';
import { dir, type Lang } from '@/i18n';

export const metadata: Metadata = { title: 'Meridian · MET Revenue Intelligence', description: 'Concentrix MET new-business intelligence', icons: { icon: '/favicon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await readSession().catch(() => null);
  const c = await cookies();
  const lang = (s?.user.lang ?? c.get('mer_lang')?.value ?? 'en') as Lang;
  const theme = s?.user.theme ?? c.get('mer_theme')?.value ?? 'light';
  return (
    <html lang={lang} dir={dir(lang)} data-theme={theme} className={theme === 'dark' ? 'dark' : ''}>
      <body className="bg-bg text-ink">{children}</body>
    </html>
  );
}
