'use server';
import { revalidatePath } from 'next/cache';
import { sql } from '@/db';
import { requireUser } from '@/lib/auth';
import { assertCan, ROLES } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { token } from '@/lib/crypto';
import { setSetting, getSettings } from '@/lib/settings';
import { enqueue } from '@/lib/jobs/queue';
import { z } from 'zod';

async function admin() { const u = await requireUser(); assertCan(u, 'admin'); return u; }
const list = (v: FormDataEntryValue | null) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export async function inviteUser(fd: FormData) {
  const u = await admin();
  const v = z.object({ email: z.string().email().max(200), name: z.string().min(2).max(120), role: z.enum(ROLES as [string, ...string[]]) }).parse(Object.fromEntries(fd));
  const tok = token(24);
  const countries = list(fd.get('countries')).map((c) => c.toUpperCase());
  await sql`INSERT INTO users (email, name, role, countries, sectors, invite_token, invite_expires, lang, work_week, timezone, currency, manager_id)
    VALUES (${v.email.toLowerCase()}, ${v.name}, ${v.role}, ${countries.length ? countries : ['AE']}, ${list(fd.get('sectors'))}, ${tok}, now() + interval '7 days',
      ${fd.get('lang') === 'ar' ? 'ar' : 'en'}, ${fd.get('work_week') === 'sun-thu' ? 'sun-thu' : 'mon-fri'}, ${fd.get('work_week') === 'sun-thu' ? 'Asia/Riyadh' : 'Asia/Dubai'}, ${fd.get('work_week') === 'sun-thu' ? 'SAR' : 'AED'}, ${String(fd.get('manager_id') ?? '') || null})
    ON CONFLICT (email) DO UPDATE SET invite_token = EXCLUDED.invite_token, invite_expires = EXCLUDED.invite_expires, role = EXCLUDED.role, active = true`;
  await audit(u.id, 'user.invite', 'user', v.email, { role: v.role });
  revalidatePath('/admin');
}
export async function updateUser(id: string, fd: FormData) {
  const u = await admin();
  const role = String(fd.get('role'));
  if (!ROLES.includes(role as any)) throw new Error('Bad role');
  await sql`UPDATE users SET role = ${role}, countries = ${list(fd.get('countries')).map((c) => c.toUpperCase())}, sectors = ${list(fd.get('sectors'))}, active = ${fd.get('active') === 'on'}, manager_id = ${String(fd.get('manager_id') ?? '') || null} WHERE id = ${id}`;
  if (fd.get('active') !== 'on') await sql`DELETE FROM sessions WHERE user_id = ${id}`;
  await audit(u.id, 'user.update', 'user', id, { role });
  revalidatePath('/admin');
}
export async function resetMfa(id: string) {
  const u = await admin();
  await sql`UPDATE users SET mfa_enabled = false, totp_secret_enc = NULL WHERE id = ${id}`;
  await sql`DELETE FROM sessions WHERE user_id = ${id}`;
  await audit(u.id, 'user.mfa_reset', 'user', id);
  revalidatePath('/admin');
}

export async function saveSource(fd: FormData) {
  const u = await admin();
  const id = String(fd.get('id') ?? '');
  const v = {
    name: String(fd.get('name')).slice(0, 200), url: z.string().url().parse(String(fd.get('url'))), type: z.enum(['rss', 'sitemap', 'listing', 'page', 'search']).parse(fd.get('type')),
    lang: String(fd.get('lang') ?? 'en'), country: String(fd.get('country') ?? 'AE'), category: String(fd.get('category') ?? 'news'), frequency_min: Number(fd.get('frequency_min') ?? 360),
    priority: Number(fd.get('priority') ?? 3), quality: Number(fd.get('quality') ?? 3), enabled: fd.get('enabled') === 'on', terms_checked: fd.get('terms_checked') === 'on',
    store_full_text: fd.get('store_full_text') === 'on', notes: String(fd.get('notes') ?? ''),
  };
  if (id) await sql`UPDATE sources SET ${sql(v as any)} WHERE id = ${id}`;
  else await sql`INSERT INTO sources ${sql(v as any)}`;
  await audit(u.id, id ? 'source.update' : 'source.create', 'source', id || v.url, { enabled: v.enabled });
  revalidatePath('/admin');
}
export async function runSource(id: string) {
  const u = await admin();
  await enqueue('crawl_source', { sourceId: id }, { dedupeKey: `src:${id}` });
  await audit(u.id, 'source.run', 'source', id);
  revalidatePath('/admin');
}

export async function saveScoring(fd: FormData) {
  const u = await admin();
  const s = await getSettings();
  const w = (tr: string) => ({ fit: Number(fd.get(`${tr}_fit`)), intent: Number(fd.get(`${tr}_intent`)), timing: Number(fd.get(`${tr}_timing`)), access: Number(fd.get(`${tr}_access`)) });
  await setSetting('weights', { enterprise: w('enterprise'), smb: w('smb'), competitor: w('competitor') });
  await setSetting('tiers', { leader: Number(fd.get('leader')), team: Number(fd.get('team')) });
  await setSetting('playThreshold', Number(fd.get('playThreshold')));
  await setSetting('coverageThreshold', Number(fd.get('coverageThreshold')));
  await setSetting('staleDays', Number(fd.get('staleDays')));
  await setSetting('realistic', { watchFactor: Number(fd.get('watchFactor')), atRiskFactor: Number(fd.get('atRiskFactor')) });
  await audit(u.id, 'settings.scoring', 'settings', 'weights', { before: s.weights });
  await enqueue('rescore_all', {}, { dedupeKey: 'rescore' });
  revalidatePath('/admin');
}
export async function saveAi(fd: FormData) {
  const u = await admin();
  const s = await getSettings();
  const models = Object.fromEntries(Object.keys(s.models).map((k) => [k, String(fd.get(`model_${k}`) ?? s.models[k])]));
  await setSetting('models', models);
  await setSetting('aiDailyBudgetUsd', Number(fd.get('budget')));
  await setSetting('aiEnabled', fd.get('aiEnabled') === 'on');
  await audit(u.id, 'settings.ai', 'settings', 'ai', { models });
  revalidatePath('/admin');
}
export async function saveLowPeriods(fd: FormData) {
  const u = await admin();
  const rows = String(fd.get('periods') ?? '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(x[1]) && /^\d{4}-\d{2}-\d{2}$/.test(x[2]));
  await setSetting('lowActivityPeriods', rows.map(([name, from, to]) => ({ name, from, to })));
  await audit(u.id, 'settings.low_periods');
  revalidatePath('/admin');
}

export async function saveOffer(fd: FormData) {
  const u = await admin();
  const v = { key: String(fd.get('key')).replace(/[^a-z0-9_]/g, '_'), name_en: String(fd.get('name_en')), name_ar: String(fd.get('name_ar')), pitch_en: String(fd.get('pitch_en')), pitch_ar: String(fd.get('pitch_ar')),
    ideal_signals: list(fd.get('ideal_signals')), ideal_sectors: list(fd.get('ideal_sectors')), ideal_types: list(fd.get('ideal_types')), active: fd.get('active') === 'on',
    proof_points: sql.json(String(fd.get('proof_points') ?? '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map(([text, url]) => ({ text, url: url ?? '' })) as any) };
  await sql`INSERT INTO offers ${sql(v as any)} ON CONFLICT (key) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, pitch_en = EXCLUDED.pitch_en, pitch_ar = EXCLUDED.pitch_ar, ideal_signals = EXCLUDED.ideal_signals, ideal_sectors = EXCLUDED.ideal_sectors, ideal_types = EXCLUDED.ideal_types, proof_points = EXCLUDED.proof_points, active = EXCLUDED.active`;
  await audit(u.id, 'offer.save', 'offer', v.key);
  revalidatePath('/admin');
}
export async function saveStage(key: string, fd: FormData) {
  const u = await admin();
  await sql`UPDATE stages SET name_en = ${String(fd.get('name_en'))}, name_ar = ${String(fd.get('name_ar'))}, probability = ${Number(fd.get('probability'))}, norm_days = ${Number(fd.get('norm_days'))}, stale_days = ${Number(fd.get('stale_days'))}, entry_criteria = ${list(fd.get('entry_criteria'))} WHERE key = ${key}`;
  await audit(u.id, 'stage.save', 'stage', key);
  revalidatePath('/admin');
}
export async function saveFx(fd: FormData) {
  const u = await admin();
  for (const [k, v] of fd.entries()) if (k.startsWith('fx_') && Number(v) > 0) await sql`INSERT INTO fx_rates (currency, per_usd, updated_at) VALUES (${k.slice(3)}, ${Number(v)}, now()) ON CONFLICT (currency) DO UPDATE SET per_usd = EXCLUDED.per_usd, updated_at = now()`;
  await audit(u.id, 'fx.save');
  revalidatePath('/admin');
}
export async function saveRate(fd: FormData) {
  const u = await admin();
  await sql`INSERT INTO rate_cards (country, service_type, min_usd_per_seat_month, max_usd_per_seat_month, is_placeholder) VALUES (${String(fd.get('country')).toUpperCase()}, ${String(fd.get('service_type'))}, ${Number(fd.get('min'))}, ${Number(fd.get('max'))}, ${fd.get('placeholder') === 'on'})
    ON CONFLICT (country, service_type) DO UPDATE SET min_usd_per_seat_month = EXCLUDED.min_usd_per_seat_month, max_usd_per_seat_month = EXCLUDED.max_usd_per_seat_month, is_placeholder = EXCLUDED.is_placeholder`;
  await audit(u.id, 'rate.save');
  revalidatePath('/admin');
}
export async function saveCompetitor(fd: FormData) {
  const u = await admin();
  await sql`INSERT INTO competitors (name, aliases) VALUES (${String(fd.get('name'))}, ${list(fd.get('aliases'))}) ON CONFLICT (name) DO UPDATE SET aliases = EXCLUDED.aliases`;
  await audit(u.id, 'competitor.save');
  revalidatePath('/admin');
}
export async function deletePerson(fd: FormData) {
  const u = await admin();
  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 3) throw new Error('Enter the full name');
  const p = await sql`DELETE FROM people WHERE lower(name) = lower(${name}) RETURNING id`;
  const r = await sql`DELETE FROM relationships WHERE lower(person_name) = lower(${name}) RETURNING id`;
  await audit(u.id, 'privacy.delete_person', 'person', undefined, { people: p.length, relationships: r.length });
  revalidatePath('/admin');
}
export async function retryDead() {
  const u = await admin();
  await sql`UPDATE jobs SET status = 'queued', attempts = 0, run_at = now() WHERE status = 'dead'`;
  await audit(u.id, 'jobs.retry_dead');
  revalidatePath('/admin');
}
export async function applyCalibration(fd: FormData) {
  const u = await admin();
  const s = await getSettings();
  const w = JSON.parse(String(fd.get('weights')));
  await setSetting('weights', { ...s.weights, enterprise: w, smb: w });
  await audit(u.id, 'settings.calibration_applied', 'settings', 'weights', { before: s.weights, after: w });
  await enqueue('rescore_all', {}, { dedupeKey: 'rescore' });
  revalidatePath('/admin');
}
