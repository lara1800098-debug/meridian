import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, DemoTag, Field, HealthBadge, PageHeader, Select, SuggestTag } from '@/components/ui';
import { loadDeals, stages } from '@/lib/data/deals';
import { sql } from '@/db';
import { date, money } from '@/lib/format';
import { CURRENCIES, DEAL_SOURCES, LOSS_REASONS, SECTORS } from '@/lib/taxonomy';
import { closeDeal, quickUpdate, updateDeal } from '../actions';
import { reasonText } from '@/lib/view';
import { ruleNba } from '@/lib/engine/nba';
import { criteriaMissing } from '@/lib/engine/health';
import { can } from '@/lib/rbac';

export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const q = await searchParams;
  const ctx = await pageCtx();
  const { t, lang, fx, cur, user, hijri, tz } = ctx;
  const [d] = await loadDeals(user, fx, { ids: [id] });
  if (!d) notFound();
  const st = await stages();
  const stageName = (k: string) => { const s = st.find((x) => x.key === k); return s ? (lang === 'ar' ? s.name_ar : s.name_en) : k; };
  const hist = await sql`SELECT h.*, u.name FROM deal_history h LEFT JOIN users u ON u.id = h.user_id WHERE deal_id = ${id} ORDER BY at DESC LIMIT 60`;
  const linked = await sql`SELECT s.id, s.title, s.signal_type, s.track, s.first_seen_at FROM deal_signals ds JOIN signals s ON s.id = ds.signal_id WHERE ds.deal_id = ${id} ORDER BY s.first_seen_at DESC`;
  const leader = d.org_id ? (await sql`SELECT title FROM signals WHERE org_id = ${d.org_id} AND signal_type = 'leader_appointed' AND first_seen_at > now() - interval '60 days' LIMIT 1`)[0]?.title : null;
  const nba = ruleNba(d.health, { stageSort: d.stageObj.sort, recentLeaderSignal: leader });
  const owners = await sql`SELECT id, name FROM users WHERE active AND role IN ('ae','bdr','director') ORDER BY name`;
  const tenders = await sql`SELECT id, filename, decision FROM tenders WHERE deal_id = ${id}`;
  const missing = criteriaMissing(d as any, d.stageObj.entry_criteria);
  const editable = can(user, 'deals.edit') && d.status === 'open';
  const dv = (x: any) => (x ? new Date(x).toISOString().slice(0, 10) : '');
  return (
    <Shell ctx={ctx} active="deals">
      <div className="mb-2 text-sm"><Link href="/deals" className="text-ink-3 hover:underline">← {t('deals.title')}</Link></div>
      {q.from === 'play' && <p role="status" className="mb-3 rounded-ctl bg-good/10 px-3 py-2 text-sm text-good">{t('plays.accepted')}</p>}
      <PageHeader title={d.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><HealthBadge status={d.health.status} t={t} /><span>{stageName(d.stage)} · {d.probability}%</span><span>·</span><span className="font-num">{money(d.tcv_usd, cur, fx, lang)}</span>{d.org_id && <><span>·</span><Link className="hover:underline" href={`/orgs/${d.org_id}`}>{d.org_name}</Link></>}{d.is_demo && <DemoTag t={t} />}</span>}
        actions={d.play_id ? <Link className="btn-ghost" href={`/plays/${d.play_id}`}>{t('nav.plays')} →</Link> : undefined} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {editable && (
            <Card title={t('deals.quick')} className="border-brand-a1/40">
              <p className="mb-3 text-xs text-ink-3">{t('deals.saveHint')}</p>
              <form action={quickUpdate.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
                <Select name="stage" value={d.stage} label={t('deals.stage')} options={st.filter((s) => !s.is_closed).map((s) => [s.key, `${lang === 'ar' ? s.name_ar : s.name_en} (${s.probability}%)`])} />
                <Field label={t('deals.nextStepDate')} name="next_step_date" type="date" defaultValue={dv(d.next_step_date)} />
                <Field label={t('deals.nextStep')} name="next_step" defaultValue={d.next_step} className="sm:col-span-2" />
                <Field label={t('deals.oneLine')} name="note" className="sm:col-span-2" />
                <div><button className="btn-primary">{t('common.save')}</button></div>
              </form>
            </Card>
          )}

          <Card title={t('deals.health')}>
            {d.health.reasons.length ? (
              <ul className="space-y-2 text-sm">
                {d.health.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.severity === 3 ? 'bg-bad' : r.severity === 2 ? 'bg-warn' : 'bg-ink-3'}`} />
                    <span>{reasonText(r, t, lang, stageName)} {r.signalId && <Link className="text-xs text-brand-a1 underline" href={`/signals/${r.signalId}`}>{t('common.source')}</Link>}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-good">✓ {t('deals.healthy')}</p>}
            {nba && (
              <div className="mt-4 rounded-ctl border border-brand-a3/30 bg-brand-a3/5 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium">{t('deals.nba')} <SuggestTag t={t} /></div>
                <div className="text-sm font-medium">{nba[lang].action}</div>
                <p className="mt-1 text-xs text-ink-2">{nba[lang].reason}</p>
              </div>
            )}
          </Card>

          <Card title={t('deals.fields')}>
            <form action={updateDeal.bind(null, id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <fieldset disabled={!editable} className="contents">
                <Field label={t('common.title')} name="title" defaultValue={d.title} className="sm:col-span-2 lg:col-span-3" />
                <Field label={t('deals.tcv')} name="tcv" type="number" defaultValue={Number(d.tcv)} />
                <Field label={t('deals.annual')} name="annual_value" type="number" defaultValue={Number(d.annual_value)} />
                <Select name="currency" value={d.currency} label={t('common.currency')} options={CURRENCIES.map((c) => [c, c])} />
                <Field label={`${t('common.reason')} (value change)`} name="value_note" placeholder="Why did the value change?" className="sm:col-span-2 lg:col-span-3" />
                <Field label={t('deals.close')} name="expected_close" type="date" defaultValue={dv(d.expected_close)} />
                <Field label={t('deals.decisionDate')} name="decision_date" type="date" defaultValue={dv(d.decision_date)} />
                <Field label={`${t('deals.probability')} (override)`} name="probability_override" type="number" defaultValue={d.probability_override} />
                <Field label={t('deals.economicBuyer')} name="economic_buyer" defaultValue={d.economic_buyer} />
                <Field label={t('deals.champion')} name="champion" defaultValue={d.champion} />
                <Field label={t('deals.compellingEvent')} name="compelling_event" defaultValue={d.compelling_event} />
                <Field label={t('deals.competitors')} name="competitors" defaultValue={d.competitors.join(', ')} />
                <Select name="sector" value={d.sector} label={t('common.sector')} options={SECTORS.map((s) => [s, t(`sectors.${s}`)])} />
                <Select name="track" value={d.track} label={t('common.track')} options={[['enterprise', t('tracks.enterprise')], ['smb', t('tracks.smb')]]} />
                <Select name="source" value={d.source} label={t('deals.source')} options={DEAL_SOURCES.map((s) => [s, t(`deals.sources.${s}`)])} />
                <Select name="owner_id" value={d.owner_id ?? ''} label={t('common.owner')} options={owners.map((o) => [o.id, o.name])} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="scope_recorded" defaultChecked={d.scope_recorded} /> {t('deals.scope')}</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="owner_commit" defaultChecked={d.owner_commit} /> {t('deals.commit')}</label>
                <label className="block sm:col-span-2 lg:col-span-3"><span className="label">{t('common.notes')}</span><textarea name="notes" className="input min-h-20" defaultValue={d.notes} /></label>
                {editable && <div><button className="btn-primary">{t('common.save')}</button></div>}
              </fieldset>
            </form>
          </Card>

          <Card title={t('deals.history')}>
            <ol className="space-y-1.5 text-xs">
              {hist.map((h) => (
                <li key={h.id} className="flex gap-2"><span className="w-28 shrink-0 text-ink-3">{date(h.at, lang, tz, hijri)}</span><span><span className="font-medium">{h.name ?? 'system'}</span> · {h.field === 'note' ? <q>{h.new_value}</q> : <>{h.field}: <s className="text-ink-3">{h.old_value ?? '∅'}</s> → {h.new_value ?? '∅'}</>}{h.note && h.field !== 'note' ? ` — ${h.note}` : ''}</span></li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t('deals.criteria')}>
            <ul className="space-y-1 text-sm">{d.stageObj.entry_criteria.map((c) => <li key={c} className={missing.includes(c) ? 'text-bad' : 'text-good'}>{missing.includes(c) ? '✗' : '✓'} {t(`criteria.${c}`)}</li>)}{!d.stageObj.entry_criteria.length && <li className="muted">{t('common.none')}</li>}</ul>
          </Card>
          <Card title={t('deals.signalsAgainst')}>
            {linked.length ? <ul className="space-y-2 text-sm">{linked.map((s) => <li key={s.id}><Link className="hover:underline" href={`/signals/${s.id}`}>{s.title}</Link><div className="text-xs text-ink-3">{t(`signalTypes.${s.signal_type}`)} · {date(s.first_seen_at, lang)}</div></li>)}</ul> : <p className="muted">{t('common.none')}</p>}
          </Card>
          {tenders.length > 0 && <Card title={t('nav.tenders')}><ul className="text-sm">{tenders.map((x) => <li key={x.id}><Link className="hover:underline" href={`/tenders/${x.id}`}>{x.filename}</Link></li>)}</ul></Card>}
          {editable && (
            <Card title={t('common.close')}>
              <form action={closeDeal.bind(null, id)} className="space-y-2">
                <input type="hidden" name="outcome" value="won" />
                <Field label={t('deals.finalValue')} name="final_value" type="number" required />
                <button className="btn-primary w-full">{t('deals.closeWon')}</button>
              </form>
              <form action={closeDeal.bind(null, id)} className="mt-4 space-y-2">
                <Select name="outcome" value="lost" label={t('common.status')} options={[['lost', t('deals.status.lost')], ['no_decision', t('deals.status.no_decision')]]} />
                <Select name="reason" value="price" label={`${t('common.reason')} *`} options={LOSS_REASONS.map((r) => [r, t(`deals.lossReasons.${r}`)])} />
                <Field label={t('common.notes')} name="note" />
                <button className="btn-danger w-full">{t('deals.closeLost')}</button>
              </form>
            </Card>
          )}
          {d.status !== 'open' && <Card title={t('common.status')}><p className="text-sm">{t(`deals.status.${d.status}`)}{d.close_reason ? ` — ${t(`deals.lossReasons.${d.close_reason}`)}` : ''}{d.final_value ? ` — ${money(Number(d.final_value), d.currency, { [d.currency]: 1 }, lang)}` : ''}</p></Card>}
        </div>
      </div>
    </Shell>
  );
}
