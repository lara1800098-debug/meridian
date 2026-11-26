'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { sql } from '@/db';
import { createSession, hashPassword, localProvider, markMfaPassed, passwordProblems, readSession, storeTotpSecret, verifyUserTotp, checkTotp } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { rateLimit } from '@/lib/ratelimit';
import { decrypt } from '@/lib/crypto';

async function ip() { const h = await headers(); return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'; }

export async function loginAction(_: unknown, fd: FormData) {
  const email = String(fd.get('email') ?? '').trim().slice(0, 200);
  const password = String(fd.get('password') ?? '').slice(0, 200);
  if (!(await rateLimit(`login:${await ip()}`, 20, 900))) return { error: 'locked' };
  const r = await localProvider.verifyPrimary(email, password);
  if (!r.ok) return { error: r.reason };
  await createSession(r.userId);
  await audit(r.userId, 'login.password_ok');
  const [u] = await sql`SELECT mfa_enabled FROM users WHERE id = ${r.userId}`;
  redirect(u.mfa_enabled ? '/mfa' : '/mfa/setup');
}

export async function mfaAction(_: unknown, fd: FormData) {
  const s = await readSession();
  if (!s) redirect('/login');
  if (!(await rateLimit(`mfa:${s.user.id}`, 10, 900))) return { error: 'locked' };
  const ok = await verifyUserTotp(s.user.id, String(fd.get('code') ?? ''));
  if (!ok) { await audit(s.user.id, 'mfa.failed'); return { error: 'mfaInvalid' }; }
  await markMfaPassed(s.sid);
  await sql`UPDATE users SET last_login_at = now() WHERE id = ${s.user.id}`;
  await audit(s.user.id, 'login.success');
  redirect('/');
}

export async function mfaSetupAction(_: unknown, fd: FormData) {
  const s = await readSession();
  if (!s) redirect('/login');
  if (s.mfa_enabled) redirect('/mfa');
  const [u] = await sql`SELECT totp_secret_enc FROM users WHERE id = ${s.user.id}`;
  if (!u?.totp_secret_enc) return { error: 'mfaInvalid' };
  const ok = await checkTotp(decrypt(u.totp_secret_enc), String(fd.get('code') ?? ''));
  if (!ok) return { error: 'mfaInvalid' };
  await sql`UPDATE users SET mfa_enabled = true, last_login_at = now() WHERE id = ${s.user.id}`;
  await markMfaPassed(s.sid);
  await audit(s.user.id, 'mfa.enrolled');
  redirect('/');
}

export async function ensurePendingSecret(userId: string, make: () => string) {
  const [u] = await sql`SELECT totp_secret_enc, mfa_enabled FROM users WHERE id = ${userId}`;
  if (u.totp_secret_enc) return decrypt(u.totp_secret_enc);
  const secret = make();
  await storeTotpSecret(userId, secret);
  return secret;
}

export async function inviteAction(_: unknown, fd: FormData) {
  const tok = String(fd.get('token') ?? '');
  const pw = String(fd.get('password') ?? ''), pw2 = String(fd.get('password2') ?? '');
  const [u] = await sql`SELECT id FROM users WHERE invite_token = ${tok} AND invite_expires > now() AND active`;
  if (!u) return { error: 'inviteInvalid' };
  if (pw !== pw2) return { error: 'mismatch' };
  if (passwordProblems(pw).length) return { error: 'passwordRules' };
  await sql`UPDATE users SET password_hash = ${await hashPassword(pw)}, invite_token = NULL, invite_expires = NULL, mfa_enabled = false, totp_secret_enc = NULL WHERE id = ${u.id}`;
  await audit(u.id, 'invite.accepted');
  await createSession(u.id);
  redirect('/mfa/setup');
}
