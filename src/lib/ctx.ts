import 'server-only';
import { requireUser } from './auth';
import { translator, type Lang } from '@/i18n';
import { sql } from '@/db';
import type { Fx } from './format';
import { cookies } from 'next/headers';

/** Everything a page needs: user, translator, fx, display currency (toggle), hijri preference. */
export async function pageCtx() {
  const user = await requireUser();
  const lang = user.lang as Lang;
  const t = translator(lang);
  const fxRows = await sql`SELECT currency, per_usd FROM fx_rates`;
  const fx: Fx = Object.fromEntries(fxRows.map((r) => [r.currency, Number(r.per_usd)]));
  const c = await cookies();
  const cur = c.get('mer_cur')?.value || user.currency;
  const hijri = c.get('mer_hijri')?.value === '1';
  return { user, lang, t, fx, cur, hijri, tz: user.timezone };
}
export type Ctx = Awaited<ReturnType<typeof pageCtx>>;
