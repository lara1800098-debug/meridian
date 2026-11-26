import { cookies } from 'next/headers';
import { translator, type Lang } from '@/i18n';
import { Lockup } from '@/components/Shell';
import { setLang } from '@/app/actions/prefs';

export async function authT() {
  const lang = ((await cookies()).get('mer_lang')?.value ?? 'en') as Lang;
  return { lang, t: translator(lang) };
}

export default async function AuthFrame({ children }: { children: React.ReactNode }) {
  const { lang, t } = await authT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <Lockup lang={lang} theme="light" t={t} />
          <form action={setLang.bind(null, lang === 'ar' ? 'en' : 'ar')}><button className="btn-ghost !py-1 text-xs">{lang === 'ar' ? 'English' : 'العربية'}</button></form>
        </div>
        <div className="card p-6">{children}</div>
        <p className="mt-4 text-center text-xs text-ink-3">{t('auth.tagline')}</p>
      </div>
    </div>
  );
}
