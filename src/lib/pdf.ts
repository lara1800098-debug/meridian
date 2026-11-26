import 'server-only';
import { chromium, type Browser } from 'playwright';

let browser: Browser | null = null;
async function getBrowser() {
  if (browser?.isConnected()) return browser;
  const opts: any = { args: ['--no-sandbox'] };
  try { browser = await chromium.launch(opts); }
  catch { browser = await chromium.launch({ ...opts, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' }); }
  return browser;
}

/** Renders an internal /print/* page to an A4 PDF with the caller's session cookie. The browser only talks to this app. */
export async function renderPdf(path: string, cookie: { name: string; value: string }) {
  const base = process.env.INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
  const b = await getBrowser();
  const ctx = await b.newContext();
  try {
    // Block every request that is not to this app (no outbound connections from PDF rendering).
    await ctx.route('**/*', (r) => (r.request().url().startsWith(base) || r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    await ctx.addCookies([{ name: cookie.name, value: cookie.value, url: base }]);
    const page = await ctx.newPage();
    await page.goto(base + path, { waitUntil: 'networkidle', timeout: 30000 });
    return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '12mm', right: '12mm' } });
  } finally { await ctx.close(); }
}
