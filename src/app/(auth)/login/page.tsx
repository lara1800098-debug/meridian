import AuthFrame, { authT } from '../AuthFrame';
import { AuthForm } from '../forms';
import { loginAction } from '../actions';

export default async function Login() {
  const { t } = await authT();
  return (
    <AuthFrame>
      <h1 className="h2 mb-4">{t('auth.signIn')}</h1>
      <AuthForm action={loginAction} submit={t('auth.signIn')} labels={{ invalid: t('auth.invalid'), locked: t('auth.locked') }}
        fields={[{ name: 'email', type: 'email', label: t('auth.email'), autoComplete: 'username' }, { name: 'password', type: 'password', label: t('auth.password'), autoComplete: 'current-password' }]} />
    </AuthFrame>
  );
}
