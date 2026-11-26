import AuthFrame, { authT } from '../../AuthFrame';
import { AuthForm } from '../../forms';
import { inviteAction } from '../../actions';
import { sql } from '@/db';

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await authT();
  const [u] = await sql`SELECT name, email FROM users WHERE invite_token = ${token} AND invite_expires > now() AND active`;
  return (
    <AuthFrame>
      {!u ? <p className="text-sm text-bad">{t('auth.inviteInvalid')}</p> : (
        <>
          <h1 className="h2">{t('auth.inviteTitle')}, {u.name}</h1>
          <p className="muted mb-1 mt-1">{t('auth.inviteSet')}</p>
          <p className="mb-4 text-xs text-ink-3">{t('auth.passwordRules')}</p>
          <AuthForm action={inviteAction} hidden={{ token }} submit={t('auth.activate')}
            labels={{ inviteInvalid: t('auth.inviteInvalid'), mismatch: t('auth.mismatch'), passwordRules: t('auth.passwordRules') }}
            fields={[{ name: 'password', type: 'password', label: t('auth.password'), autoComplete: 'new-password' }, { name: 'password2', type: 'password', label: t('auth.confirm'), autoComplete: 'new-password' }]} />
        </>
      )}
    </AuthFrame>
  );
}
