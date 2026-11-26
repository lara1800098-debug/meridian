'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { sql } from '@/db';
import { readSession } from '@/lib/auth';
import { CURRENCIES } from '@/lib/taxonomy';

export async function setLang(lang: 'en' | 'ar') {
  if (!['en', 'ar'].includes(lang)) return;
  (await cookies()).set('mer_lang', lang, { path: '/', maxAge: 31536000 });
  const s = await readSession();
  if (s) await sql`UPDATE users SET lang = ${lang} WHERE id = ${s.user.id}`;
  revalidatePath('/', 'layout');
}
export async function setTheme(theme: 'light' | 'dark') {
  if (!['light', 'dark'].includes(theme)) return;
  (await cookies()).set('mer_theme', theme, { path: '/', maxAge: 31536000 });
  const s = await readSession();
  if (s) await sql`UPDATE users SET theme = ${theme} WHERE id = ${s.user.id}`;
  revalidatePath('/', 'layout');
}
export async function setCurrency(fd: FormData) {
  const c = String(fd.get('cur'));
  if (!(CURRENCIES as readonly string[]).includes(c)) return;
  (await cookies()).set('mer_cur', c, { path: '/', maxAge: 31536000 });
  revalidatePath('/', 'layout');
}
export async function toggleHijri() {
  const c = await cookies();
  c.set('mer_hijri', c.get('mer_hijri')?.value === '1' ? '0' : '1', { path: '/', maxAge: 31536000 });
  revalidatePath('/', 'layout');
}
