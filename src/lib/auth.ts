import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verify } from 'otplib';
import { sql } from '@/db';
import { decrypt, encrypt, sha256, token } from './crypto';
import type { SessionUser } from './rbac';
import { audit } from './audit';

export const COOKIE = 'mer_sid';
const IDLE_MIN = 30;            // session timeout after inactivity
const ABSOLUTE_HOURS = 12;      // hard cap
const MAX_FAILS = 5;
const LOCK_MIN = 15;

/** Auth is behind this interface so SSO could be added later without touching pages. (No SSO is built.) */
export interface AuthProvider { verifyPrimary(email: string, password: string): Promise<{ ok: true; userId: string } | { ok: false; reason: string }>; }

export function passwordProblems(pw: string): string[] {
  const p: string[] = [];
  if (pw.length < 12) p.push('min12');
  if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw)) p.push('case');
  if (!/[0-9]/.test(pw)) p.push('digit');
  if (!/[^A-Za-z0-9]/.test(pw)) p.push('symbol');
  return p;
}
export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);

export const localProvider: AuthProvider = {
  async verifyPrimary(email, password) {
    const [u] = await sql`SELECT id, password_hash, active, failed_logins, locked_until FROM users WHERE lower(email) = lower(${email})`;
    if (!u || !u.active || !u.password_hash) { await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv'); return { ok: false, reason: 'invalid' }; }
    if (u.locked_until && new Date(u.locked_until) > new Date()) return { ok: false, reason: 'locked' };
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      const fails = u.failed_logins + 1;
      await sql`UPDATE users SET failed_logins = ${fails >= MAX_FAILS ? 0 : fails}, locked_until = ${fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60000) : null} WHERE id = ${u.id}`;
      await audit(u.id, 'login.failed');
      return { ok: false, reason: fails >= MAX_FAILS ? 'locked' : 'invalid' };
    }
    await sql`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ${u.id}`;
    return { ok: true, userId: u.id };
  },
};

export async function createSession(userId: string) {
  const raw = token();
  await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${sha256(raw)}, ${userId}, ${new Date(Date.now() + ABSOLUTE_HOURS * 3600_000)})`;
  (await cookies()).set(COOKIE, raw, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.APP_URL?.startsWith('https') === true, path: '/', maxAge: ABSOLUTE_HOURS * 3600 });
}

export async function destroySession() {
  const c = await cookies();
  const raw = c.get(COOKIE)?.value;
  if (raw) await sql`DELETE FROM sessions WHERE id = ${sha256(raw)}`;
  c.delete(COOKIE);
}

type Sess = { sid: string; user: SessionUser; mfa_passed: boolean; mfa_enabled: boolean };

export async function readSession(): Promise<Sess | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const sid = sha256(raw);
  const [r] = await sql`
    SELECT s.mfa_passed, s.last_seen_at, s.expires_at, u.id, u.email, u.name, u.role, u.lang, u.timezone, u.work_week, u.currency, u.theme,
           u.countries, u.sectors, u.manager_id, u.mfa_enabled, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ${sid}`;
  if (!r || !r.active) return null;
  const now = Date.now();
  if (new Date(r.expires_at).getTime() < now || now - new Date(r.last_seen_at).getTime() > IDLE_MIN * 60000) {
    await sql`DELETE FROM sessions WHERE id = ${sid}`;
    return null;
  }
  if (now - new Date(r.last_seen_at).getTime() > 60000) await sql`UPDATE sessions SET last_seen_at = now() WHERE id = ${sid}`;
  const { mfa_passed, mfa_enabled, last_seen_at, expires_at, active, ...user } = r;
  return { sid, user: user as SessionUser, mfa_passed, mfa_enabled };
}

/** Use in every server page/action. Enforces login + MFA server-side. */
export async function requireUser(): Promise<SessionUser> {
  const s = await readSession();
  if (!s) redirect('/login');
  if (!s.mfa_passed) redirect(s.mfa_enabled ? '/mfa' : '/mfa/setup');
  return s.user;
}

// ---- TOTP MFA ----
export function newTotpSecret() { return generateSecret(); }
export function totpUri(email: string, secret: string) { return generateURI({ issuer: 'Meridian (Concentrix)', label: email, secret }); }
export async function checkTotp(secret: string, code: string) {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  try { return (await verify({ secret, token: clean, epochTolerance: 30 } as any)).valid; } catch { return false; }
}
export async function verifyUserTotp(userId: string, code: string) {
  const [u] = await sql`SELECT totp_secret_enc FROM users WHERE id = ${userId}`;
  if (!u?.totp_secret_enc) return false;
  return checkTotp(decrypt(u.totp_secret_enc), code);
}
export async function storeTotpSecret(userId: string, secret: string) {
  await sql`UPDATE users SET totp_secret_enc = ${encrypt(secret)} WHERE id = ${userId}`;
}
export async function markMfaPassed(sid: string) { await sql`UPDATE sessions SET mfa_passed = true WHERE id = ${sid}`; }
