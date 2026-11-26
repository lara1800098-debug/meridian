import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, Field, Kpi, PageHeader, Select } from '@/components/ui';
import { sql } from '@/db';
import { size, smbProxy, value } from '@/lib/engine/sizer';
import { money, num } from '@/lib/format';

export default async function Sizer({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await pageCtx();
  const { t, lang, fx, cur } = ctx;
  const q = await searchParams;
  const rates = await sql`SELECT * FROM rate_cards ORDER BY country, service_type`;
  const n = (k: string, d: number) => (q[k] != null && q[k] !== '' ? Number(q[k]) : d);
  const proxy = q.proxy === '1' ? smbProxy({ headcount: n('headcount', 0) || undefined, customers: n('customers', 0) || undefined, csRoles: n('csRoles', 0) || undefined }) : null;
  const monthly = proxy?.monthlyContacts || n('volume', 0);
  const voice = n('voice', 70), chat = n('chat', 20), email = n('email', 10);
  const mixSum = voice + chat + email || 100;
  const input = { monthlyContacts: monthly, mix: { voice: voice / mixSum, chat: chat / mixSum, email: email / mixSum }, ahtSec: n('aht', 300), hoursPerDay: n('hours', 12), daysPerWeek: n('days', 6), slTarget: n('sl', 80) / 100, slSec: n('slSec', 20), shrinkage: n('shrink', 30) / 100, languages: n('langs', 2) };
  const loc = q.loc ?? 'AE', svc = q.svc ?? 'omnichannel';
  const rc = rates.find((r) => r.country === loc && r.service_type === svc) ?? rates.find((r) => r.country === loc);
  const res = monthly > 0 ? size(input) : null;
  const val = res && rc ? value(res.seats, { min: Number(rc.min_usd_per_seat_month), max: Number(rc.max_usd_per_seat_month) }) : null;
  return (
    <Shell ctx={ctx} active="sizer">
      <PageHeader title={t('sizer.title')} subtitle={t('common.indicative')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <form className="grid grid-cols-2 gap-3">
            <Field label={t('sizer.volume')} name="volume" type="number" defaultValue={q.volume ?? 60000} className="col-span-2" />
            <Field label={`${t('sizer.voice')} %`} name="voice" type="number" defaultValue={voice} />
            <Field label={`${t('sizer.chat')} %`} name="chat" type="number" defaultValue={chat} />
            <Field label={`${t('sizer.email')} %`} name="email" type="number" defaultValue={email} />
            <Field label={t('sizer.aht')} name="aht" type="number" defaultValue={input.ahtSec} />
            <Field label={t('sizer.hours')} name="hours" type="number" defaultValue={input.hoursPerDay} />
            <Field label={t('sizer.daysWeek')} name="days" type="number" defaultValue={input.daysPerWeek} />
            <Field label={`${t('sizer.sl')} %`} name="sl" type="number" defaultValue={input.slTarget * 100} />
            <Field label={t('sizer.slSec')} name="slSec" type="number" defaultValue={input.slSec} />
            <Field label={`${t('sizer.shrinkage')} %`} name="shrink" type="number" defaultValue={input.shrinkage * 100} />
            <Field label={t('sizer.languages')} name="langs" type="number" defaultValue={input.languages} />
            <Select name="loc" value={loc} label={t('sizer.location')} options={[...new Set(rates.map((r) => r.country))].map((c) => [c, t(`countries.${c}`)])} />
            <Select name="svc" value={svc} label={t('sizer.service')} options={[...new Set(rates.map((r) => r.service_type))].map((s) => [s, s.replace('_', ' ')])} />
            <details className="col-span-2 rounded-ctl border border-line p-3" open={q.proxy === '1'}>
              <summary className="cursor-pointer text-sm font-medium">{t('sizer.smbProxy')}</summary>
              <input type="hidden" name="proxy" value={q.proxy === '1' ? '1' : '0'} />
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Field label={t('sizer.headcount')} name="headcount" type="number" defaultValue={q.headcount} />
                <Field label={t('sizer.customers')} name="customers" type="number" defaultValue={q.customers} />
                <Field label={t('sizer.csHiring')} name="csRoles" type="number" defaultValue={q.csRoles} />
              </div>
              <button name="proxy" value="1" className="btn-ghost mt-3">{t('sizer.calc')} (proxy)</button>
            </details>
            <div className="col-span-2"><button className="btn-primary">{t('sizer.calc')}</button></div>
          </form>
        </Card>
        <div className="space-y-4">
          {res ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Kpi label={t('sizer.fte')} value={`${num(res.fte[0], lang)}–${num(res.fte[1], lang)}`} />
                <Kpi label={t('sizer.seats')} value={`${num(res.seats[0], lang)}–${num(res.seats[1], lang)}`} />
              </div>
              {val && <Kpi label={t('sizer.dealValue')} value={`${money(val.annualLowUsd, cur, fx, lang)} – ${money(val.annualHighUsd, cur, fx, lang)}`} sub={t('common.indicative')} />}
              <Card title={t('sizer.assumptions')}>
                <ul className="list-disc space-y-1 ps-5 text-sm text-ink-2">
                  {proxy && proxy.assumptions.map((a) => <li key={a}>{a} → {num(proxy.monthlyContacts, lang)} contacts/month</li>)}
                  <li>Erlang C at busy hour (1.3× average), {Math.round(input.slTarget * 100)}/{input.slSec} service level; voice {res.detail.voiceAgents}, chat {res.detail.chatAgents} (concurrency 2), email {res.detail.emailAgents} agents on shift.</li>
                  <li>Coverage {res.detail.coverageFactor}× (open hours vs 40-hour FTE week), language split {res.detail.langFactor}×, shrinkage {Math.round(input.shrinkage * 100)}%.</li>
                  {rc && <li>Rate card {loc} / {rc.service_type}: USD {num(Number(rc.min_usd_per_seat_month))}–{num(Number(rc.max_usd_per_seat_month))} per seat per month{rc.is_placeholder ? ' — PLACEHOLDER' : ''}.</li>}
                </ul>
                {rc?.is_placeholder && <p className="mt-2 text-xs text-warn">{t('sizer.placeholderRates')}</p>}
              </Card>
            </>
          ) : <Card><p className="muted">{t('sizer.calc')} →</p></Card>}
        </div>
      </div>
    </Shell>
  );
}
