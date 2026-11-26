import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import AuthFrame, { authT } from '../../AuthFrame';
import { AuthForm } from '../../forms';
import { ensurePendingSecret, mfaSetupAction } from '../../actions';
import { newTotpSecret, readSession, totpUri } from '@/lib/auth';

export default async function MfaSetup() {
  const s = await readSession();
  if (!s) redirect('/login');
  if (s.mfa_enabled) redirect(s.mfa_passed ? '/' : '/mfa');
  const { t } = await authT();
  const secret = await ensurePendingSecret(s.user.id, newTotpSecret);
  const qr = await QRCode.toDataURL(totpUri(s.user.email, secret), { margin: 1, width: 200 });
  return (
    <AuthFrame>
      <h1 className="h2">{t('auth.setupTitle')}</h1>
      <p className="muted mb-4 mt-1">{t('auth.setupPrompt')}</p>
      <img src={qr} alt="QR code" className="mx-auto mb-3 rounded bg-white p-2" width={200} height={200} />
      <p className="label">{t('auth.secret')}</p>
      <code data-testid="totp-secret" className="mb-4 block break-all rounded bg-surface-2 p-2 text-xs" dir="ltr">{secret}</code>
      <AuthForm action={mfaSetupAction} submit={t('auth.verify')} labels={{ mfaInvalid: t('auth.mfaInvalid') }}
        fields={[{ name: 'code', type: 'text', label: t('auth.code'), autoComplete: 'one-time-code', inputMode: 'numeric' }]} />
    </AuthFrame>
  );
}
