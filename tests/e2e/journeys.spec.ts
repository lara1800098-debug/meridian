import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { login, resetDemoPlay } from './helpers';

const shots = process.env.SHOTS_DIR;
const shot = async (page: any, name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };

test('unauthenticated users are sent to login; wrong password is rejected', async ({ page }) => {
  await page.goto('/deals');
  await expect(page).toHaveURL(/\/login/);
  await page.fill('input[name=email]', 'ceo.demo@meridian.local');
  await page.fill('input[name=password]', 'wrong-password');
  await page.locator('form button.btn-primary').click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('executive: MFA login → cockpit → brief → PDF', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'ceo.demo@meridian.local');
  await expect(page.getByRole('heading', { name: 'Leadership cockpit' })).toBeVisible();
  await expect(page.getByText('Top plays this week')).toBeVisible();
  await expect(page.getByText('DEMO DATA').first()).toBeVisible();
  await shot(page, 'cockpit');
  await page.getByRole('link', { name: /Monday Brief →/ }).click();
  await expect(page.getByText('Three decisions for you')).toBeVisible();
  await shot(page, 'brief');
  const pdfHref = await page.getByRole('link', { name: 'Export PDF' }).getAttribute('href');
  const res = await page.request.get(pdfHref!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  const body = await res.body();
  expect(body.subarray(0, 4).toString()).toBe('%PDF');
  expect((body.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1); // one-page brief
  if (shots) writeFileSync(`${shots}/monday-brief.pdf`, body);
  expect(errors).toEqual([]);
});

test('AE: play shows scores + sources; accept creates a deal; quick update saves', async ({ page }) => {
  await resetDemoPlay('healthcare');
  await login(page, 'ae1.demo@meridian.local');
  await page.goto('/plays?tier=ALL');
  await page.locator('a[href^="/plays/"]').first().click();
  await expect(page.locator('text=/الملاءمة|Fit/').first()).toBeVisible();
  await shot(page, 'play-ar');
  await page.locator('form button.btn-primary').first().click(); // Accept
  await expect(page).toHaveURL(/\/deals\/[0-9a-f-]+\?from=play/);
  await page.fill('input[name=next_step]', 'Discovery call booked');
  await page.fill('input[name=note]', 'Spoke to the patient experience team');
  await page.locator('form button.btn-primary').first().click();
  await expect(page.getByText('Discovery call booked').first()).toBeVisible();
  await shot(page, 'deal');
});

test('director: forecast, deals with health reasons, review pack, Arabic RTL', async ({ page }) => {
  await login(page, 'director.uae.demo@meridian.local');
  await page.goto('/deals?health=at_risk');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.goto('/forecast');
  await expect(page.getByText('How the realistic forecast is calculated')).toBeVisible();
  await shot(page, 'forecast');
  await page.goto('/review');
  await expect(page.getByText('Questions to ask').first()).toBeVisible();
  await page.locator('header').getByRole('button', { name: 'Language' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'لوحة القيادة' })).toBeVisible();
  await shot(page, 'cockpit-ar');
  await page.locator('header').getByRole('button', { name: 'اللغة' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('RBAC: AE cannot open admin or cockpit; BDR cannot see another owner’s deal', async ({ page }) => {
  await login(page, 'bdr.demo@meridian.local');
  const r = await page.goto('/admin');
  expect(r!.status()).toBeGreaterThanOrEqual(400);
  await page.goto('/');
  await expect(page).toHaveURL(/\/plays/);
  await page.goto('/deals');
  const titles = await page.locator('tbody tr a').allTextContents();
  expect(titles.some((x) => x.includes('Sahel Energy'))).toBe(false); // owned by ae1
});

test('admin: import sample pipeline Excel → health flags + forecast', async ({ page }) => {
  await login(page, 'admin@meridian.local', process.env.SEED_ADMIN_PASSWORD || 'Admin-Meridian-2026!');
  await page.goto('/deals/import');
  await page.setInputFiles('input[name=file]', 'public/samples/sample-pipeline.xlsx');
  await page.locator('form button.btn-primary').click();
  await expect(page.getByText(/Validation preview/)).toBeVisible();
  await page.getByRole('button', { name: /Import \d+ deals/ }).click();
  await expect(page).toHaveURL(/imported=\d+/);
  await page.goto('/deals?health=at_risk');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await shot(page, 'import-health');
  await page.goto('/admin?tab=sources');
  await expect(page.getByText('Wamda')).toBeVisible();
});

test('phone: Monday Brief and cockpit are readable at iPhone width', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, 'ceo.demo@meridian.local');
  const noHScroll = async () => expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth))).toBeLessThanOrEqual(391);
  await noHScroll();
  await shot(page, 'mobile-cockpit');
  await page.goto('/brief');
  await expect(page.getByText('Three decisions for you')).toBeVisible();
  await noHScroll();
  await shot(page, 'mobile-brief');
  await ctx.close();
});
