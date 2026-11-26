import Link from 'next/link';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, Field, Kpi, PageHeader, Select } from '@/components/ui';
import { sql } from '@/db';
import { assertCan, ROLES } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { date } from '@/lib/format';
import { aiAvailable, spentTodayUsd } from '@/lib/ai/client';
import { calibrate } from '@/lib/engine/calibrate';
import * as A from './actions';
import { SIGNAL_TYPE_KEYS } from '@/lib/taxonomy';

const TABS = ['users', 'sources', 'scoring', 'offers', 'stages', 'fx', 'rates', 'competitors', 'ai', 'monitor', 'calibration', 'privacy', 'audit'] as const;

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await pageCtx();
  const { t, lang, user } = ctx;
  assertCan(user, 'admin');
  const tab = ((await searchParams).tab ?? 'users') as (typeof TABS)[number];
  const s = await getSettings();
  const base = process.env.APP_URL || 'http://localhost:3000';
  let body: React.ReactNode = null;

  if (tab === 'users') {
    const users = await sql`SELECT * FROM users ORDER BY created_at`;
    const mgrs = users.filter((u) => ['director', 'executive', 'admin'].includes(u.role));
    body = (
      <div className="space-y-4">
        <Card title={t('admin.invite')}>
          <form action={A.inviteUser} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label={t('common.name')} name="name" required /><Field label={t('auth.email')} name="email" type="email" required />
            <Select name="role" value="ae" label="Role" options={ROLES.map((r) => [r, t(`roles.${r}`)])} />
            <Field label="Countries (AE,SA)" name="countries" defaultValue="AE" /><Field label="Sectors (optional)" name="sectors" />
            <Select name="work_week" value="mon-fri" label={t('common.workWeek')} options={[['mon-fri', 'Mon–Fri'], ['sun-thu', 'Sun–Thu']]} />
            <Select name="lang" value="en" label={t('common.language')} options={[['en', 'English'], ['ar', 'العربية']]} />
            <Select name="manager_id" value="" label="Manager" options={[['', '—'], ...mgrs.map((m) => [m.id, m.name] as [string, string])]} />
            <div className="flex items-end"><button className="btn-primary">{t('admin.invite')}</button></div>
          </form>
        </Card>
        <Card title={t('admin.users')}>
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>{t('common.name')}</th><th>Role · territory</th><th>MFA</th><th>{t('admin.inviteLink')}</th></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}<div className="text-xs text-ink-3" dir="ltr">{u.email}</div><div className="text-xs text-ink-3">{u.last_login_at ? date(u.last_login_at, lang) : '—'}</div></td>
                <td><form action={A.updateUser.bind(null, u.id)} className="flex flex-wrap items-center gap-1.5">
                  <select name="role" defaultValue={u.role} className="input !w-auto !py-1 text-xs">{ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select>
                  <input name="countries" defaultValue={u.countries.join(',')} className="input !w-20 !py-1 text-xs" aria-label="countries" />
                  <input name="sectors" defaultValue={u.sectors.join(',')} className="input !w-28 !py-1 text-xs" aria-label="sectors" placeholder="sectors" />
                  <select name="manager_id" defaultValue={u.manager_id ?? ''} className="input !w-auto !py-1 text-xs" aria-label="manager"><option value="">—</option>{mgrs.filter((m) => m.id !== u.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                  <label className="text-xs"><input type="checkbox" name="active" defaultChecked={u.active} /> active</label>
                  <button className="btn-ghost !py-1 text-xs">{t('common.save')}</button></form></td>
                <td className="text-xs">{u.mfa_enabled ? '✓' : '—'} {u.mfa_enabled && u.id !== user.id && <form action={A.resetMfa.bind(null, u.id)} className="inline"><button className="text-bad underline">reset</button></form>}</td>
                <td className="max-w-xs text-xs">{u.invite_token && new Date(u.invite_expires) > new Date() ? <code className="break-all" dir="ltr">{base}/invite/{u.invite_token}</code> : '—'}</td>
              </tr>
            ))}</tbody></table></div>
        </Card>
      </div>
    );
  }

  if (tab === 'sources') {
    const src = await sql`SELECT * FROM sources ORDER BY enabled DESC, priority DESC, name`;
    body = (
      <div className="space-y-4">
        <Card><div className="overflow-x-auto"><table className="table"><thead><tr><th>{t('common.name')}</th><th>{t('admin.health')}</th><th>{t('admin.items')}</th><th /></tr></thead>
          <tbody>{src.map((x) => {
            const health = !x.enabled ? 'off' : x.last_error && (!x.last_success_at || new Date(x.last_error ? x.last_run_at : 0) >= new Date(x.last_success_at)) ? 'error' : x.last_success_at ? 'ok' : 'pending';
            return (
              <tr key={x.id}>
                <td><details><summary className="cursor-pointer font-medium">{x.name}</summary>
                  <form action={A.saveSource} className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input type="hidden" name="id" value={x.id} />
                    <Field label="Name" name="name" defaultValue={x.name} /><Field label="URL" name="url" defaultValue={x.url} className="sm:col-span-2" />
                    <Select name="type" value={x.type} label="Type" options={['rss', 'sitemap', 'listing', 'page', 'search'].map((v) => [v, v])} />
                    <Select name="lang" value={x.lang} label="Lang" options={[['en', 'EN'], ['ar', 'AR'], ['both', 'Both']]} />
                    <Field label="Country" name="country" defaultValue={x.country} /><Field label="Category" name="category" defaultValue={x.category} />
                    <Field label="Every (min)" name="frequency_min" type="number" defaultValue={x.frequency_min} /><Field label="Priority 1–5" name="priority" type="number" defaultValue={x.priority} /><Field label="Quality 1–5" name="quality" type="number" defaultValue={x.quality} />
                    <label className="text-xs"><input type="checkbox" name="enabled" defaultChecked={x.enabled} /> {t('admin.enabled')}</label>
                    <label className="text-xs"><input type="checkbox" name="terms_checked" defaultChecked={x.terms_checked} /> {t('admin.termsChecked')}</label>
                    <label className="text-xs"><input type="checkbox" name="store_full_text" defaultChecked={x.store_full_text} /> store full text (official sources only)</label>
                    <Field label={t('common.notes')} name="notes" defaultValue={x.notes} className="sm:col-span-3" />
                    <div><button className="btn-ghost text-xs">{t('common.save')}</button></div>
                  </form></details>
                  <div className="text-xs text-ink-3">{x.type} · {x.lang} · {x.category} {!x.terms_checked && <span className="chip bg-warn/15 text-warn">terms not confirmed</span>}</div>
                  <div className="text-xs text-ink-3">{x.notes}</div></td>
                <td className="text-xs"><span className={health === 'ok' ? 'text-good' : health === 'error' ? 'text-bad' : 'text-ink-3'}>{health}</span><div className="text-ink-3">{t('admin.lastSuccess')}: {x.last_success_at ? date(x.last_success_at, lang) : '—'}</div>{x.last_error && <div className="max-w-xs text-bad">{x.last_error}</div>}<div>{t('admin.errors')}: {x.error_count}/{x.run_count}</div></td>
                <td className="font-num text-xs">{x.items_found}</td>
                <td>{x.enabled && <form action={A.runSource.bind(null, x.id)}><button className="btn-ghost !py-1 text-xs">{t('admin.runSource')}</button></form>}</td>
              </tr>
            );
          })}</tbody></table></div></Card>
        <Card title={`+ ${t('admin.sources')}`}>
          <form action={A.saveSource} className="grid gap-2 sm:grid-cols-3">
            <Field label="Name" name="name" required /><Field label="URL" name="url" required className="sm:col-span-2" />
            <Select name="type" value="rss" label="Type" options={['rss', 'sitemap', 'listing', 'page', 'search'].map((v) => [v, v])} />
            <Select name="lang" value="en" label="Lang" options={[['en', 'EN'], ['ar', 'AR'], ['both', 'Both']]} /><Field label="Country" name="country" defaultValue="AE" />
            <label className="text-xs"><input type="checkbox" name="terms_checked" /> {t('admin.termsChecked')}</label><label className="text-xs"><input type="checkbox" name="enabled" /> {t('admin.enabled')}</label>
            <div><button className="btn-primary text-xs">{t('common.add')}</button></div>
          </form>
        </Card>
      </div>
    );
  }

  if (tab === 'scoring') {
    const W = (tr: 'enterprise' | 'smb' | 'competitor') => (
      <div key={tr}><div className="label">{t(`tracks.${tr}`)}</div><div className="grid grid-cols-4 gap-2">{(['fit', 'intent', 'timing', 'access'] as const).map((k) => <Field key={k} label={t(`scores.${k}`)} name={`${tr}_${k}`} type="number" step="0.05" defaultValue={s.weights[tr][k]} />)}</div></div>
    );
    body = (
      <Card title={t('admin.scoring')}>
        <form action={A.saveScoring} className="space-y-4">
          {W('enterprise')}{W('smb')}{W('competitor')}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Leader-grade ≥" name="leader" type="number" defaultValue={s.tiers.leader} /><Field label="Team-grade ≥" name="team" type="number" defaultValue={s.tiers.team} />
            <Field label="Play threshold ≥" name="playThreshold" type="number" defaultValue={s.playThreshold} /><Field label="Coverage warning <" name="coverageThreshold" type="number" step="0.1" defaultValue={s.coverageThreshold} />
            <Field label="Stale after (days)" name="staleDays" type="number" defaultValue={s.staleDays} /><Field label="Watch factor" name="watchFactor" type="number" step="0.05" defaultValue={s.realistic.watchFactor} /><Field label="At-risk factor" name="atRiskFactor" type="number" step="0.05" defaultValue={s.realistic.atRiskFactor} />
          </div>
          <button className="btn-primary">{t('common.save')} & rescore</button>
        </form>
        <form action={A.saveLowPeriods} className="mt-6 space-y-2">
          <div className="label">Low-activity periods (name | from | to) — confirm Islamic calendar dates each year</div>
          <textarea name="periods" className="input min-h-32 font-mono text-xs" defaultValue={s.lowActivityPeriods.map((p) => `${p.name} | ${p.from} | ${p.to}`).join('\n')} />
          <button className="btn-ghost">{t('common.save')}</button>
        </form>
      </Card>
    );
  }

  if (tab === 'offers') {
    const offers = await sql`SELECT * FROM offers ORDER BY key`;
    const form = (o?: any) => (
      <form action={A.saveOffer} className="grid gap-2 sm:grid-cols-2">
        <Field label="Key" name="key" defaultValue={o?.key} required /><label className="text-xs"><input type="checkbox" name="active" defaultChecked={o?.active ?? true} /> active</label>
        <Field label="Name EN" name="name_en" defaultValue={o?.name_en} required /><Field label="Name AR" name="name_ar" defaultValue={o?.name_ar} required />
        <Field label="Pitch EN" name="pitch_en" defaultValue={o?.pitch_en} required /><Field label="Pitch AR" name="pitch_ar" defaultValue={o?.pitch_ar} required />
        <Field label="Ideal signals" name="ideal_signals" defaultValue={o?.ideal_signals.join(',')} placeholder={SIGNAL_TYPE_KEYS.slice(0, 4).join(',')} /><Field label="Ideal sectors" name="ideal_sectors" defaultValue={o?.ideal_sectors.join(',')} />
        <Field label="Ideal org types" name="ideal_types" defaultValue={o?.ideal_types.join(',')} />
        <label className="block sm:col-span-2"><span className="label">Proof points (text | url per line — anonymise where needed)</span><textarea name="proof_points" className="input min-h-16 text-xs" defaultValue={(o?.proof_points ?? []).map((p: any) => `${p.text} | ${p.url}`).join('\n')} /></label>
        <div><button className="btn-ghost text-xs">{t('common.save')}</button></div>
      </form>
    );
    body = <div className="space-y-3">{offers.map((o) => <Card key={o.key}><details><summary className="cursor-pointer font-medium">{o.name_en} <span className="text-xs text-ink-3">{o.active ? '' : '(inactive)'} · {o.proof_points.length} proof points</span></summary><div className="mt-3">{form(o)}</div></details></Card>)}<Card title={`+ ${t('admin.offers')}`}>{form()}</Card></div>;
  }

  if (tab === 'stages') {
    const st = await sql`SELECT * FROM stages ORDER BY sort`;
    body = <Card title={t('admin.stages')}><div className="space-y-3">{st.map((x) => (
      <form key={x.key} action={A.saveStage.bind(null, x.key)} className="grid items-end gap-2 sm:grid-cols-7">
        <div className="text-xs font-mono">{x.key}</div><Field label="EN" name="name_en" defaultValue={x.name_en} /><Field label="AR" name="name_ar" defaultValue={x.name_ar} />
        <Field label="%" name="probability" type="number" defaultValue={x.probability} /><Field label="Norm days" name="norm_days" type="number" defaultValue={x.norm_days} /><Field label="Stale days" name="stale_days" type="number" defaultValue={x.stale_days} />
        <Field label="Entry criteria" name="entry_criteria" defaultValue={x.entry_criteria.join(',')} className="sm:col-span-6" /><button className="btn-ghost text-xs">{t('common.save')}</button>
      </form>
    ))}</div><p className="mt-3 text-xs text-ink-3">Criteria keys: economic_buyer, compelling_event, value, champion, scope, decision_date, next_step</p></Card>;
  }

  if (tab === 'fx') {
    const fx = await sql`SELECT * FROM fx_rates ORDER BY currency`;
    body = <Card title={`${t('admin.fx')} (per 1 USD)`}><form action={A.saveFx} className="grid grid-cols-2 gap-3 sm:grid-cols-6">{fx.map((r) => <Field key={r.currency} label={`${r.currency} · ${date(r.updated_at, lang)}`} name={`fx_${r.currency}`} type="number" step="0.0001" defaultValue={Number(r.per_usd)} />)}<div className="flex items-end"><button className="btn-primary">{t('common.save')}</button></div></form></Card>;
  }

  if (tab === 'rates') {
    const r = await sql`SELECT * FROM rate_cards ORDER BY country, service_type`;
    body = <Card title={t('admin.rates')}><table className="table"><tbody>{r.map((x) => <tr key={x.id}><td>{x.country}</td><td>{x.service_type}</td><td className="font-num">USD {Number(x.min_usd_per_seat_month)}–{Number(x.max_usd_per_seat_month)} / seat / month</td><td className="text-xs">{x.is_placeholder ? <span className="text-warn">placeholder</span> : 'approved'}</td></tr>)}</tbody></table>
      <form action={A.saveRate} className="mt-4 grid gap-2 sm:grid-cols-6"><Field label="Country" name="country" defaultValue="AE" /><Field label="Service type" name="service_type" defaultValue="omnichannel" /><Field label="Min USD" name="min" type="number" /><Field label="Max USD" name="max" type="number" /><label className="text-xs"><input type="checkbox" name="placeholder" /> placeholder</label><button className="btn-primary">{t('common.save')}</button></form></Card>;
  }

  if (tab === 'competitors') {
    const c = await sql`SELECT * FROM competitors ORDER BY name`;
    body = <Card title={t('admin.competitors')}><ul className="mb-4 space-y-1 text-sm">{c.map((x) => <li key={x.id}><b>{x.name}</b> <span className="text-ink-3">{x.aliases.join(', ')}</span></li>)}</ul><form action={A.saveCompetitor} className="grid gap-2 sm:grid-cols-3"><Field label={t('common.name')} name="name" required /><Field label="Aliases" name="aliases" /><div className="flex items-end"><button className="btn-primary">{t('common.save')}</button></div></form></Card>;
  }

  if (tab === 'ai') {
    const today = await spentTodayUsd();
    const usage = await sql`SELECT task, model, count(*)::int AS calls, sum(input_tokens)::int AS inp, sum(output_tokens)::int AS outp, sum(cost_usd)::float AS cost, sum(CASE WHEN cached THEN 1 ELSE 0 END)::int AS cached, sum(CASE WHEN ok THEN 0 ELSE 1 END)::int AS errors FROM ai_usage WHERE at > now() - interval '30 days' GROUP BY 1, 2 ORDER BY cost DESC`;
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Kpi label="API key" value={aiAvailable() ? '✓ configured' : '— not set'} sub={aiAvailable() ? undefined : t('common.aiOff')} /><Kpi label={t('admin.usageToday')} value={`$${today.toFixed(2)}`} sub={`/ $${s.aiDailyBudgetUsd}`} tone={today >= s.aiDailyBudgetUsd ? 'bad' : undefined} /></div>
        <Card title={t('admin.ai')}>
          <form action={A.saveAi} className="grid gap-3 sm:grid-cols-3">
            {Object.entries(s.models).map(([k, v]) => <Field key={k} label={`${t('admin.models')}: ${k}`} name={`model_${k}`} defaultValue={v} />)}
            <Field label={t('admin.budget')} name="budget" type="number" step="0.5" defaultValue={s.aiDailyBudgetUsd} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="aiEnabled" defaultChecked={s.aiEnabled} /> AI enabled</label>
            <div><button className="btn-primary">{t('common.save')}</button></div>
          </form>
        </Card>
        <Card title="Last 30 days"><table className="table"><thead><tr><th>Task</th><th>Model</th><th>Calls</th><th>Tokens in/out</th><th>Cached</th><th>Errors</th><th>Est. cost</th></tr></thead><tbody>{usage.map((u, i) => <tr key={i}><td>{u.task}</td><td className="text-xs">{u.model}</td><td className="font-num">{u.calls}</td><td className="font-num text-xs">{u.inp}/{u.outp}</td><td className="font-num">{u.cached}</td><td className="font-num">{u.errors}</td><td className="font-num">${(u.cost ?? 0).toFixed(3)}</td></tr>)}</tbody></table></Card>
      </div>
    );
  }

  if (tab === 'monitor') {
    const jobs = await sql`SELECT status, count(*)::int AS n FROM jobs WHERE created_at > now() - interval '7 days' GROUP BY 1`;
    const dead = await sql`SELECT * FROM jobs WHERE status = 'dead' ORDER BY finished_at DESC LIMIT 20`;
    const recent = await sql`SELECT * FROM jobs ORDER BY id DESC LIMIT 20`;
    const [src] = await sql`SELECT count(*) FILTER (WHERE enabled)::int AS en, count(*) FILTER (WHERE enabled AND last_error IS NOT NULL)::int AS err, count(*) FILTER (WHERE last_success_at > now() - interval '24 hours')::int AS ok24 FROM sources`;
    const [counts] = await sql`SELECT (SELECT count(*) FROM signals)::int AS signals, (SELECT count(*) FROM snapshots)::int AS snapshots, (SELECT count(*) FROM plays)::int AS plays, (SELECT count(*) FROM deals)::int AS deals`;
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{jobs.map((j) => <Kpi key={j.status} label={`Jobs ${j.status} (7d)`} value={j.n} tone={j.status === 'dead' && j.n ? 'bad' : undefined} />)}<Kpi label="Sources enabled / erroring / ok 24h" value={`${src.en} / ${src.err} / ${src.ok24}`} /><Kpi label="Signals · snapshots · plays · deals" value={`${counts.signals} · ${counts.snapshots} · ${counts.plays} · ${counts.deals}`} /></div>
        <Card title={t('admin.dead')} action={dead.length > 0 && <form action={A.retryDead}><button className="btn-ghost text-xs">Retry all</button></form>}><table className="table"><tbody>{dead.map((j) => <tr key={j.id}><td className="text-xs">{j.type}</td><td className="text-xs text-bad">{j.last_error}</td><td className="text-xs">{date(j.finished_at, lang)}</td></tr>)}</tbody></table></Card>
        <Card title={t('admin.jobs')}><table className="table"><tbody>{recent.map((j) => <tr key={j.id}><td className="font-num text-xs">#{j.id}</td><td className="text-xs">{j.type}</td><td className="text-xs">{j.status} ({j.attempts})</td><td className="max-w-md truncate text-xs text-ink-3">{j.last_error}</td></tr>)}</tbody></table></Card>
      </div>
    );
  }

  if (tab === 'calibration') {
    const rows = await sql`SELECT o.outcome, o.signal_type, p.scores, p.total FROM play_outcomes o JOIN plays p ON p.id = o.play_id`;
    const byType = new Map<string, { a: number; d: number; w: number }>();
    const band = new Map<string, { a: number; d: number }>();
    for (const r of rows) {
      const k = r.signal_type ?? 'unknown'; const v = byType.get(k) ?? { a: 0, d: 0, w: 0 };
      if (r.outcome === 'accepted') v.a++; if (r.outcome === 'dismissed') v.d++; if (r.outcome === 'won') v.w++; byType.set(k, v);
      const b = `${Math.floor((r.total ?? 0) / 10) * 10}s`; const bv = band.get(b) ?? { a: 0, d: 0 }; if (r.outcome === 'accepted') bv.a++; if (r.outcome === 'dismissed') bv.d++; band.set(b, bv);
    }
    const samples = rows.filter((r) => ['accepted', 'dismissed'].includes(r.outcome) && r.scores?.fit).map((r) => ({ x: [r.scores.fit.score, r.scores.intent.score, r.scores.timing.score, r.scores.access.score] as [number, number, number, number], y: (r.outcome === 'accepted' ? 1 : 0) as 0 | 1 }));
    const cal = calibrate(samples, s.weights.enterprise);
    body = (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Conversion by signal type"><table className="table"><thead><tr><th>Type</th><th>Accepted</th><th>Dismissed</th><th>Won</th><th>Accept rate</th></tr></thead><tbody>{[...byType].map(([k, v]) => <tr key={k}><td className="text-xs">{t(`signalTypes.${k}`)}</td><td className="font-num">{v.a}</td><td className="font-num">{v.d}</td><td className="font-num">{v.w}</td><td className="font-num">{v.a + v.d ? Math.round(v.a / (v.a + v.d) * 100) : 0}%</td></tr>)}</tbody></table></Card>
        <Card title="Conversion by score band"><table className="table"><tbody>{[...band].sort().map(([k, v]) => <tr key={k}><td>{k}</td><td className="font-num">{v.a} / {v.a + v.d}</td><td className="font-num">{v.a + v.d ? Math.round(v.a / (v.a + v.d) * 100) : 0}%</td></tr>)}</tbody></table></Card>
        <Card title="Data-driven recalibration (logistic regression)" className="lg:col-span-2">
          {cal ? (
            <div className="space-y-2 text-sm">
              <p>Based on {cal.n} accepted/dismissed plays. AUC before {cal.aucBefore?.toFixed(2)} → after {cal.aucAfter?.toFixed(2)}.</p>
              <p>Current: {JSON.stringify(s.weights.enterprise)}</p><p>Proposed: <b>{JSON.stringify(cal.weights)}</b></p>
              <form action={A.applyCalibration}><input type="hidden" name="weights" value={JSON.stringify(cal.weights)} /><button className="btn-primary">Approve & apply (Enterprise + SMB)</button></form>
            </div>
          ) : <p className="muted">Needs at least 30 accepted/dismissed plays with both outcomes ({samples.length} so far).</p>}
        </Card>
      </div>
    );
  }

  if (tab === 'privacy') {
    body = (
      <Card title={t('admin.privacy')}>
        <p className="mb-3 text-sm text-ink-2">Meridian stores only public, business-context data about people (name, title, organisation, source link, date). Use this to honour a deletion request under UAE PDPL / KSA PDPL. Deletions are logged.</p>
        <form action={A.deletePerson} className="flex max-w-lg gap-2"><input name="name" className="input" placeholder="Full name exactly as stored" required /><button className="btn-danger">{t('admin.deletePerson')}</button></form>
        <p className="mt-4 text-xs text-ink-3">Retention: snapshots and signals older than the retention period can be purged with <code>npm run retention -- --days 730</code> (see README).</p>
      </Card>
    );
  }

  if (tab === 'audit') {
    const rows = await sql`SELECT a.*, u.name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.at DESC LIMIT 300`;
    body = <Card title={t('admin.audit')}><div className="overflow-x-auto"><table className="table"><tbody>{rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap text-xs">{new Date(r.at).toISOString().replace('T', ' ').slice(0, 19)}</td><td className="text-xs">{r.name ?? '—'}</td><td className="text-xs font-medium">{r.action}</td><td className="text-xs text-ink-3">{r.entity} {r.entity_id}</td><td className="max-w-xs truncate text-xs text-ink-3">{JSON.stringify(r.meta)}</td></tr>)}</tbody></table></div></Card>;
  }

  return (
    <Shell ctx={ctx} active="admin">
      <PageHeader title={t('admin.title')} />
      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Admin">{TABS.map((k) => <Link key={k} href={`/admin?tab=${k}`} className={`rounded-full px-3 py-1 text-xs ${tab === k ? 'bg-brand-primary text-brand-primary-fg' : 'bg-surface-2 text-ink-2'}`}>{t(`admin.${k}`)}</Link>)}</nav>
      {body}
    </Shell>
  );
}
