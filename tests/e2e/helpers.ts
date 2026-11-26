import { type Page, expect } from '@playwright/test';
import { generate } from 'otplib';
import postgres from 'postgres';
import { createDecipheriv, createHash } from 'node:crypto';

/** Reads the demo user's TOTP secret from the DB (test-only) so the real MFA flow is exercised. */
export async function totpFor(email: string) {
  const sql = postgres(process.env.DATABASE_URL ?? 'postgres://meridian:meridian@localhost:5432/meridian');
  const [u] = await sql`SELECT totp_secret_enc FROM users WHERE email = ${email}`;
  await sql.end();
  const key = createHash('sha256').update(process.env.APP_SECRET!).digest();
  const [iv, tag, enc] = u.totp_secret_enc.split('.').map((p: string) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export async function login(page: Page, email: string, password = 'Demo-Meridian-2026!') {
  const sql = postgres(process.env.DATABASE_URL ?? 'postgres://meridian:meridian@localhost:5432/meridian');
  await sql`DELETE FROM rate_limits`; // test-only: repeated logins from one IP would trip the real limiter
  await sql.end();
  await page.goto('/login');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.locator('form button.btn-primary').click();
  await page.waitForURL(/\/mfa/);
  await page.fill('input[name=code]', await generate({ secret: await totpFor(email) }));
  await page.locator('form button.btn-primary').click();
  await page.waitForURL((u) => !/\/(mfa|login)/.test(u.pathname), { timeout: 20000 });
  await expect(page.locator('main')).toBeVisible();
}

/** Test-only: make sure a demo play is available to the given user's territory (previous runs may have accepted it). */
export async function resetDemoPlay(sector: string) {
  const sql = postgres(process.env.DATABASE_URL ?? 'postgres://meridian:meridian@localhost:5432/meridian');
  const [p] = await sql`SELECT p.id, p.deal_id FROM plays p JOIN signals s ON s.id = p.signal_id WHERE p.is_demo AND s.sector = ${sector} ORDER BY p.total DESC LIMIT 1`;
  if (p) { await sql`UPDATE plays SET status = 'new', deal_id = NULL WHERE id = ${p.id}`; if (p.deal_id) await sql`DELETE FROM deals WHERE id = ${p.deal_id}`; }
  await sql.end();
}
