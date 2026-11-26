import { redirect } from 'next/navigation';
import AuthFrame, { authT } from '../AuthFrame';
import { AuthForm } from '../forms';
import { mfaAction } from '../actions';
import { readSession } from '@/lib/auth';

export default async function Mfa() {
  const s = await readSession();
  if (!s) redirect('/login');
  if (!s.mfa_enabled) redirect('/mfa/setup');
  const { t } = await authT();
  return (
    <AuthFrame>
      <h1 className="h2">{t('auth.mfaTitle')}</h1>
      <p className="muted mb-4 mt-1">{t('auth.mfaPrompt')}</p>
      <AuthForm action={mfaAction} submit={t('auth.verify')} labels={{ mfaInvalid: t('auth.mfaInvalid'), locked: t('auth.locked') }}
        fields={[{ name: 'code', type: 'text', label: t('auth.code'), autoComplete: 'one-time-code', inputMode: 'numeric' }]} />
    </AuthFrame>
  );
}
