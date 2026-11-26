import 'server-only';
import { sql } from '@/db';
import type { SessionUser } from './rbac';
import { can } from './rbac';
import { cockpitData, marketMoves, topPlays } from './data/cockpit';
import { aiBrief } from './ai/tasks';
import { translator } from '@/i18n';
import { money, type Fx } from './format';

/** Local week start for a user: Monday (Mon–Fri) or Sunday (Sun–Thu), in their timezone. */
export function localWeekStart(tz: string, workWeek: 'mon-fri' | 'sun-thu', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const local = new Date(Date.UTC(+get('year'), +get('month') - 1, +get('day')));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const startDow = workWeek === 'sun-thu' ? 0 : 1;
  const diff = (wd - startDow + 7) % 7;
  const ws = new Date(local.getTime() - diff * 86400000);
  return { weekStart: ws.toISOString().slice(0, 10), isStartDay: diff === 0, localHour: +get('hour') % 24 };
}

async function fxTable(): Promise<Fx> { return Object.fromEntries((await sql`SELECT currency, per_usd FROM fx_rates`).map((r) => [r.currency, Number(r.per_usd)])); }

export async function buildBrief(u: SessionUser) {
  const fx = await fxTable();
  const t = translator(u.lang);
  const lang = u.lang;
  const cd = await cockpitData(u, fx, {});
  const plays = await topPlays(u, { tier: u.role === 'executive' ? ['leader'] : ['leader', 'team'], limit: 5, days: 14 });
  const moves = await marketMoves(u, 7, 4);
  const { fc } = cd;
  const pct = fc.target ? Math.round((fc.realistic / fc.target) * 100) : null;
  const risks = cd.atRisk.slice(0, 5);
  const m = (v: number) => money(v, u.currency, fx, lang);

  const data = {
    plays: plays.map((p) => ({ id: p.id, headline: lang === 'ar' ? p.headline_ar ?? p.headline : p.headline, score: p.total, value: [m(Number(p.value_low_usd)), m(Number(p.value_high_usd))] })),
    risks: risks.map((d) => ({ id: d.id, title: d.title, org: d.org_name, value: m(d.tcv_usd), reasons: d.health.reasons.slice(0, 2).map((r) => t(`health.${r.code}`, Object.fromEntries(Object.entries(r.params).map(([k, v]) => [k, k === 'list' ? String(v).split(',').map((c) => t(`criteria.${c}`)).join(', ') : k === 'stage' ? String(v) : v])) as any)) })),
    forecast: { quarter: fc.quarter, realistic: fc.realistic, weighted: fc.weighted, commit: fc.commit, target: fc.target, pctOfTarget: pct, coverage: fc.coverage.ratio, pipeline: fc.pipeline },
    moves: moves.map((s) => ({ id: s.id, title: lang === 'en' ? s.title_en ?? s.title : s.title, type: s.signal_type, snapshotId: s.snapshot_id })),
  };

  // Headline + decisions: AI when available, otherwise deterministic templates from the same data.
  let headline: string[] = [], decisions: string[] = [], method = 'template';
  const ai = await aiBrief(lang, data);
  if (ai && ai.headline.length >= 1) { headline = ai.headline.slice(0, 3); decisions = ai.decisions.slice(0, 3); method = 'ai'; }
  else {
    const covTxt = fc.coverage.ratio != null ? `${fc.coverage.ratio.toFixed(1)}×` : '—';
    if (lang === 'ar') {
      headline = [
        `${data.plays.length} فرص جديدة تستحق وقتك هذا الأسبوع${data.plays[0] ? `، أبرزها: ${data.plays[0].headline}` : ''}.`,
        `${risks.length} صفقات معرّضة للخطر بقيمة ${m(cd.atRiskValue)}.`,
        `التوقع الواقعي للربع ${fc.quarter}: ${m(fc.realistic)}${pct != null ? ` (${pct}% من المستهدف)` : ''} — التغطية ${covTxt}.`,
      ];
      decisions = [
        data.plays[0] ? `اعتمد مسؤولاً وموعد تواصل لفرصة: ${data.plays[0].headline}` : 'راجع صندوق الفرص وحدد أولوياتك',
        risks[0] ? `اطلب من ${risks[0].owner_name ?? 'المسؤول'} خطة إنقاذ لصفقة «${risks[0].title}»` : 'لا صفقات حرجة — ركّز على توليد الفرص',
        fc.coverage.ratio != null && fc.coverage.ratio < cd.fc.coverageThreshold ? `التغطية أقل من ${cd.fc.coverageThreshold}× — خصص وقت الفريق لتوليد خط مبيعات جديد` : 'حافظ على وتيرة التحديث الأسبوعي للصفقات',
      ];
    } else {
      headline = [
        `${data.plays.length} new plays worth your time this week${data.plays[0] ? ` — top: ${data.plays[0].headline}` : ''}.`,
        `${risks.length} deals at risk, worth ${m(cd.atRiskValue)}.`,
        `${fc.quarter} realistic forecast: ${m(fc.realistic)}${pct != null ? ` (${pct}% of target)` : ''} — coverage ${covTxt}.`,
      ];
      decisions = [
        data.plays[0] ? `Confirm an owner and first-touch date for: ${data.plays[0].headline}` : 'Review the play inbox and set priorities',
        risks[0] ? `Ask ${risks[0].owner_name ?? 'the owner'} for a recovery plan on “${risks[0].title}”` : 'No critical deals — focus the team on new pipeline',
        fc.coverage.ratio != null && fc.coverage.ratio < cd.fc.coverageThreshold ? `Coverage is below ${cd.fc.coverageThreshold}× — protect team time for pipeline generation` : 'Keep the weekly deal-update rhythm',
      ];
    }
  }
  return { ...data, headline, decisions, method, generatedAt: new Date().toISOString(), lang };
}

export async function generateBriefFor(u: SessionUser, force = false) {
  const { weekStart } = localWeekStart(u.timezone, u.work_week);
  const [ex] = await sql`SELECT id FROM briefs WHERE user_id = ${u.id} AND week_start = ${weekStart}`;
  if (ex && !force) return ex.id as string;
  const content = await buildBrief(u);
  const [b] = await sql`INSERT INTO briefs (user_id, week_start, lang, content) VALUES (${u.id}, ${weekStart}, ${u.lang}, ${sql.json(content as any)})
    ON CONFLICT (user_id, week_start) DO UPDATE SET content = EXCLUDED.content, lang = EXCLUDED.lang, created_at = now() RETURNING id`;
  if (!ex) await sql`INSERT INTO notifications (user_id, kind, title, href) VALUES (${u.id}, 'brief', ${u.lang === 'ar' ? 'موجز الأسبوع جاهز' : 'Your Monday Brief is ready'}, ${`/brief/${b.id}`})`;
  return b.id as string;
}

/** Worker tick: generate at ≥ 06:00 local on the first day of each user's work week. */
export async function generateBriefsDue() {
  const users = await sql`SELECT id, email, name, role, lang, timezone, work_week, currency, theme, countries, sectors, manager_id FROM users WHERE active AND mfa_enabled`;
  let n = 0;
  for (const u of users as unknown as SessionUser[]) {
    if (!can(u, 'brief')) continue;
    const w = localWeekStart(u.timezone, u.work_week);
    if (!w.isStartDay || w.localHour < 6) continue;
    const [ex] = await sql`SELECT 1 FROM briefs WHERE user_id = ${u.id} AND week_start = ${w.weekStart}`;
    if (ex) continue;
    await generateBriefFor(u);
    n++;
  }
  return n;
}
