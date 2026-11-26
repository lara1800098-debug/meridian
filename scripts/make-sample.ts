/** Generates public/samples/sample-pipeline.xlsx — a fictional pipeline for testing the import wizard. */
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
const d = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const rows = [
  ['Opportunity Name', 'Account', 'Stage', 'Total Contract Value', 'Currency', 'Country', 'Industry', 'Close Date', 'Owner', 'Economic Buyer', 'Champion', 'Compelling Event', 'Next Step', 'Next Step Date', 'Last Activity', 'Lead Source'],
  ['Falaj Water — customer care renewal-free new scope', 'Falaj Water Services (fictional)', 'Proposal', 12000000, 'AED', 'UAE', 'utilities', d(40), '', 'GM (fictional)', '', 'Strategy refresh', 'Clarifications', d(-3), d(-30), 'Inbound'],
  ['Zahra Clinics — patient line', 'Zahra Clinics (fictional)', 'Qualified', 2500000, 'AED', 'UAE', 'healthcare', d(75), '', '', '', '', '', '', d(-2), 'Referral'],
  ['Kite Pay — support for KSA launch', 'Kite Pay (fictional)', 'Negotiation', 4100000, 'USD', 'UAE', 'fintech', d(20), '', 'CEO (fictional)', 'COO (fictional)', 'KSA launch date', 'Final pricing', d(4), d(-1), 'Meridian'],
  ['Dhow Travel — peak season surge', 'Dhow Travel (fictional)', 'Engaged', 1800000, 'AED', 'UAE', 'travel', d(-5), '', 'Ops Director (fictional)', '', 'Summer peak', 'Send proposal', d(10), d(-40), 'Event'],
  ['Nakhla Bank — collections', 'Nakhla Bank (fictional)', 'Solutioning', 9000000, 'AED', 'UAE', 'bfsi', d(60), '', '', 'Head of Collections (fictional)', 'Regulatory deadline', 'Workshop', d(7), d(-5), 'Other'],
  ['Broken row — no stage', 'Test (fictional)', '', 'abc', 'AED', 'UAE', 'other', '', '', '', '', '', '', '', '', ''],
];
mkdirSync('public/samples', { recursive: true });
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Pipeline');
rows.forEach((r) => ws.addRow(r));
await wb.xlsx.writeFile('public/samples/sample-pipeline.xlsx');
console.log('✔ public/samples/sample-pipeline.xlsx');
