import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, PageHeader } from '@/components/ui';
import { sql } from '@/db';
import { guessMapping, IMPORT_FIELDS, loadUpload, validateRows } from '@/lib/import';
import { commitImport, uploadImport } from './actions';
import { assertCan } from '@/lib/rbac';

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await pageCtx();
  const { t, user } = ctx;
  assertCan(user, 'deals.edit');
  const q = await searchParams;
  const up = q.f ? await loadUpload(q.f).catch(() => null) : null;
  let body: React.ReactNode;
  if (!up) {
    body = (
      <Card className="max-w-xl">
        <form action={uploadImport} className="space-y-4">
          <label className="block"><span className="label">Excel (.xlsx) or CSV</span><input type="file" name="file" accept=".xlsx,.csv" required className="input" /></label>
          <p className="text-xs text-ink-3">First row = column headers. Next you’ll map columns and see a validation preview before anything is saved. <a className="underline" href="/samples/sample-pipeline.xlsx">Download a sample file</a>.</p>
          <button className="btn-primary">{t('common.upload')}</button>
        </form>
      </Card>
    );
  } else {
    const guessed = guessMapping(up.headers);
    const map = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, q[`m_${f.key}`] != null ? Number(q[`m_${f.key}`]) : guessed[f.key] ?? -1]));
    const emails = new Set((await sql`SELECT lower(email) AS e FROM users WHERE active`).map((r) => r.e as string));
    const v = validateRows(up.rows, map, { currency: user.currency, country: user.countries[0] ?? 'AE' }, emails);
    const ok = v.filter((r) => r.ok).length;
    const mapping = (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {IMPORT_FIELDS.map((f) => (
          <label key={f.key} className="block"><span className="label">{f.key}{f.required ? ' *' : ''}</span>
            <select name={`m_${f.key}`} defaultValue={String(map[f.key])} className="input"><option value="-1">—</option>{up.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select>
          </label>
        ))}
      </div>
    );
    body = (
      <div className="space-y-4">
        <Card title={`1 · Map columns — ${up.name} (${up.rows.length} rows)`}>
          <form method="get" className="space-y-3"><input type="hidden" name="f" value={q.f} />{mapping}<button className="btn-ghost">Validate</button></form>
        </Card>
        <Card title={`2 · Validation preview — ${ok} ready, ${v.length - ok} with errors`}>
          <div className="max-h-[28rem] overflow-auto">
            <table className="table">
              <thead><tr><th>Row</th><th>{t('common.title')}</th><th>{t('deals.stage')}</th><th>{t('common.value')}</th><th>{t('common.status')}</th></tr></thead>
              <tbody>{v.slice(0, 200).map((r) => (
                <tr key={r.row}><td className="font-num text-xs">{r.row}</td><td className="text-sm">{r.value.title}</td><td className="text-xs">{r.value.stage ?? '—'}</td><td className="font-num text-xs">{r.value.currency} {Number.isFinite(r.value.tcv) ? r.value.tcv.toLocaleString() : '—'}</td>
                  <td className="text-xs">{r.ok ? <span className="text-good">✓ OK</span> : <span className="text-bad">{r.errors.join('; ')}</span>}{r.warnings.length > 0 && <div className="text-warn">{r.warnings.join('; ')}</div>}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <form action={commitImport} className="mt-4">
            <input type="hidden" name="f" value={q.f} />
            {IMPORT_FIELDS.map((f) => <input key={f.key} type="hidden" name={`m_${f.key}`} value={String(map[f.key])} />)}
            <button className="btn-primary" disabled={!ok}>3 · Import {ok} deals</button>
          </form>
        </Card>
      </div>
    );
  }
  return <Shell ctx={ctx} active="deals"><PageHeader title={t('deals.import')} />{body}</Shell>;
}
