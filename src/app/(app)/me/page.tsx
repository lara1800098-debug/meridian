import { revalidatePath } from 'next/cache';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, PageHeader, Select } from '@/components/ui';
import { sql } from '@/db';
import { requireUser } from '@/lib/auth';
import { CURRENCIES } from '@/lib/taxonomy';
import { audit } from '@/lib/audit';

const TZ = ['Asia/Dubai', 'Asia/Riyadh', 'Africa/Cairo', 'Asia/Amman', 'Europe/Istanbul', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Muscat', 'Europe/London'];
async function save(fd: FormData) {
  'use server';
  const u = await requireUser();
  const lang = fd.get('lang') === 'ar' ? 'ar' : 'en';
  const tz = TZ.includes(String(fd.get('timezone'))) ? String(fd.get('timezone')) : u.timezone;
  const ww = fd.get('work_week') === 'sun-thu' ? 'sun-thu' : 'mon-fri';
  const cur = (CURRENCIES as readonly string[]).includes(String(fd.get('currency'))) ? String(fd.get('currency')) : u.currency;
  await sql`UPDATE users SET lang = ${lang}, timezone = ${tz}, work_week = ${ww}, currency = ${cur} WHERE id = ${u.id}`;
  await audit(u.id, 'user.prefs');
  revalidatePath('/', 'layout');
}
export default async function Me() {
  const ctx = await pageCtx();
  const { t, user } = ctx;
  return (
    <Shell ctx={ctx} active="">
      <PageHeader title={t('nav.profile')} subtitle={`${user.email} · ${t(`roles.${user.role}`)}`} />
      <Card className="max-w-lg">
        <form action={save} className="space-y-3">
          <Select name="lang" value={user.lang} label={t('common.language')} options={[['en', 'English'], ['ar', 'العربية']]} />
          <Select name="timezone" value={user.timezone} label={t('common.timezone')} options={TZ.map((z) => [z, z])} />
          <Select name="work_week" value={user.work_week} label={t('common.workWeek')} options={[['mon-fri', 'Monday – Friday (UAE)'], ['sun-thu', 'Sunday – Thursday (KSA)']]} />
          <Select name="currency" value={user.currency} label={t('common.currency')} options={CURRENCIES.map((c) => [c, c])} />
          <button className="btn-primary">{t('common.save')}</button>
        </form>
        <p className="mt-3 text-xs text-ink-3">Your Monday Brief is generated at 06:00 on the first day of your work week, in your time zone and language.</p>
      </Card>
    </Shell>
  );
}
