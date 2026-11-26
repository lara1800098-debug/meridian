import ExcelJS from 'exceljs';
import { readSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { loadDeals, stages } from '@/lib/data/deals';
import { sql } from '@/db';
import { audit } from '@/lib/audit';

export async function GET(req: Request) {
  const s = await readSession();
  if (!s?.mfa_passed || !can(s.user, 'export')) return new Response('Forbidden', { status: 403 });
  const url = new URL(req.url);
  const fx = Object.fromEntries((await sql`SELECT currency, per_usd FROM fx_rates`).map((r) => [r.currency, Number(r.per_usd)]));
  const status = url.searchParams.get('status') ?? undefined;
  let deals = await loadDeals(s.user, fx, { status: status === 'ALL' ? undefined : status, country: url.searchParams.get('country') ?? undefined, sector: url.searchParams.get('sector') ?? undefined, track: url.searchParams.get('track') ?? undefined });
  const health = url.searchParams.get('health');
  if (health && health !== 'ALL') deals = deals.filter((d) => d.health.status === health);
  const st = await stages();
  const cols = ['Title', 'Organisation', 'Stage', 'Probability %', 'TCV', 'Annual value', 'Currency', 'TCV (USD)', 'Country', 'Sector', 'Track', 'Expected close', 'Owner', 'Source', 'Economic buyer', 'Champion', 'Compelling event', 'Next step', 'Next step date', 'Health', 'Health reasons', 'Status', 'Close reason', 'Last activity'];
  const rows = deals.map((d) => [d.title, d.org_name ?? '', st.find((x) => x.key === d.stage)?.name_en ?? d.stage, d.probability, Number(d.tcv), Number(d.annual_value), d.currency, Math.round(d.tcv_usd), d.country, d.sector, d.track,
    d.expected_close ? new Date(d.expected_close).toISOString().slice(0, 10) : '', d.owner_name ?? '', d.source, d.economic_buyer ?? '', d.champion ?? '', d.compelling_event ?? '', d.next_step ?? '',
    d.next_step_date ? new Date(d.next_step_date).toISOString().slice(0, 10) : '', d.health.status, d.health.reasons.map((r) => r.code).join(', '), d.status, d.close_reason ?? '', new Date(d.last_activity_at).toISOString().slice(0, 10)]);
  await audit(s.user.id, 'export.deals', 'deals', undefined, { format: url.searchParams.get('format'), n: rows.length });
  const stamp = new Date().toISOString().slice(0, 10);
  if (url.searchParams.get('format') === 'csv') {
    const esc = (v: unknown) => { const x = String(v ?? ''); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const csv = '﻿' + [cols, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="meridian-pipeline-${stamp}.csv"` } });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Meridian · Concentrix';
  const ws = wb.addWorksheet('Pipeline', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(cols).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c, i) => (c.width = Math.min(40, Math.max(10, cols[i].length + 4))));
  ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="meridian-pipeline-${stamp}.xlsx"` } });
}
