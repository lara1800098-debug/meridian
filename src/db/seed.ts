/**
 * Seed: `npm run db:seed` creates the first Admin.  `npm run db:seed -- --demo` also loads the DEMO dataset.
 * DEMO DATA uses clearly fictional organisations and people only (never real companies or people), and every row is flagged is_demo.
 */
import { generateSecret } from 'otplib';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { sql } from './index';
import { ensureDefaults } from './defaults';
import { encrypt } from '../lib/crypto';
import { ingestItem } from '../lib/ingest/pipeline';
import { quarterOf, nextQuarter } from '../lib/format';

const demo = process.argv.includes('--demo');
const days = (n: number) => new Date(Date.now() + n * 86400000);
const iso = (n: number) => days(n).toISOString().slice(0, 10);

async function user(email: string, name: string, role: string, opts: { password: string; countries?: string[]; lang?: string; work_week?: string; tz?: string; cur?: string; manager?: string | null; sectors?: string[] }) {
  const secret = generateSecret();
  const [u] = await sql`INSERT INTO users (email, name, role, password_hash, totp_secret_enc, mfa_enabled, countries, sectors, lang, work_week, timezone, currency, manager_id)
    VALUES (${email}, ${name}, ${role}, ${await bcrypt.hash(opts.password, 12)}, ${encrypt(secret)}, true, ${opts.countries ?? ['AE']}, ${opts.sectors ?? []}, ${opts.lang ?? 'en'}, ${opts.work_week ?? 'mon-fri'}, ${opts.tz ?? 'Asia/Dubai'}, ${opts.cur ?? 'AED'}, ${opts.manager ?? null})
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id, (xmax = 0) AS inserted`;
  if (!u.inserted) return { id: u.id as string, secret: null };
  return { id: u.id as string, secret };
}

async function main() {
  await ensureDefaults();
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@meridian.local').toLowerCase();
  const adminPw = process.env.SEED_ADMIN_PASSWORD || `Mer-${randomBytes(9).toString('base64url')}!1`;
  const a = await user(adminEmail, 'Meridian Admin', 'admin', { password: adminPw });
  if (a.secret) console.log(`\n✔ Admin created\n  email:    ${adminEmail}\n  password: ${adminPw}\n  TOTP key: ${a.secret}  (add to your authenticator app)\n`);
  else console.log(`Admin ${adminEmail} already exists — unchanged.`);
  if (!demo) { await sql.end(); return; }

  const [{ n }] = await sql`SELECT count(*)::int AS n FROM organisations WHERE is_demo`;
  if (n > 0) { console.log('Demo data already present — skipping.'); await sql.end(); return; }

  // ---- Demo users (fictional). Shared demo password; each has its own TOTP key printed below.
  const pw = process.env.DEMO_PASSWORD || 'Demo-Meridian-2026!';
  const exec = await user('ceo.demo@meridian.local', 'Layla Haddad (Demo Executive)', 'executive', { password: pw });
  const dir = await user('director.uae.demo@meridian.local', 'Omar Rahman (Demo Director UAE)', 'director', { password: pw, countries: ['AE'] });
  const ae1 = await user('ae1.demo@meridian.local', 'Sara Khalil (Demo AE — Government)', 'ae', { password: pw, countries: ['AE'], sectors: ['government', 'utilities', 'healthcare'], manager: dir.id, lang: 'ar' });
  const ae2 = await user('ae2.demo@meridian.local', 'Daniel Moore (Demo AE — Private)', 'ae', { password: pw, countries: ['AE'], sectors: ['bfsi', 'fintech', 'telecom', 'retail', 'travel', 'technology'], manager: dir.id });
  const bdr = await user('bdr.demo@meridian.local', 'Noor Aziz (Demo BDR)', 'bdr', { password: pw, countries: ['AE'], manager: dir.id });
  const ksa = await user('director.ksa.demo@meridian.local', 'Faisal Otaibi (Demo Director KSA)', 'director', { password: pw, countries: ['SA'], work_week: 'sun-thu', tz: 'Asia/Riyadh', cur: 'SAR', lang: 'ar' });
  console.log(`\n✔ Demo users (password for all: ${pw})`);
  for (const [e, u] of [['ceo.demo', exec], ['director.uae.demo', dir], ['ae1.demo', ae1], ['ae2.demo', ae2], ['bdr.demo', bdr], ['director.ksa.demo', ksa]] as const) if (u.secret) console.log(`  ${e}@meridian.local   TOTP key: ${u.secret}`);

  // ---- Fictional organisations
  const org = async (name_en: string, name_ar: string, sector: string, org_type: string, size_band = 'large') =>
    (await sql`INSERT INTO organisations (name_en, name_ar, sector, country, org_type, size_band, is_demo) VALUES (${name_en}, ${name_ar}, ${sector}, 'AE', ${org_type}, ${size_band}, true) RETURNING id`)[0].id as string;
  const O = {
    wadi: await org('Wadi Al Noor Health Services', 'خدمات وادي النور الصحية', 'healthcare', 'government'),
    saraab: await org('Saraab Mobile', 'سراب موبايل', 'telecom', 'private'),
    lumen: await org('Lumen Pay', 'لومن باي', 'fintech', 'startup', 'medium'),
    najm: await org('Najm Air', 'طيران نجم', 'travel', 'semi_government'),
    bayt: await org('Bayt Retail Group', 'مجموعة بيت للتجزئة', 'retail', 'private'),
    rimal: await org('Al Rimal Citizen Services Centre', 'مركز الرمال لخدمات المواطنين', 'government', 'government'),
    qamar: await org('Qamar Digital Bank', 'بنك قمر الرقمي', 'bfsi', 'private'),
    dune: await org('Dune Logistics', 'ديون للخدمات اللوجستية', 'logistics', 'private', 'medium'),
    sahel: await org('Sahel Energy Utilities', 'سهل لمرافق الطاقة', 'utilities', 'semi_government'),
    tilal: await org('Tilal Insurance', 'تلال للتأمين', 'bfsi', 'private'),
    mirage: await org('Mirage Properties', 'ميراج العقارية', 'real_estate', 'private'),
    oasis: await org('Oasis EdTech', 'واحة للتعليم الرقمي', 'education', 'startup', 'small'),
  };

  await sql`INSERT INTO competitors (name, aliases) VALUES ('Nimbus CX', '{}') ON CONFLICT DO NOTHING`; // fictional demo competitor
  // ---- Demo signals run through the REAL pipeline (rules classifier → scoring → plays). URLs are example.com placeholders.
  const S = (title: string, excerpt: string, ago: number, slug: string, outlet = 'Demo Gazette') => ({ title, excerpt, publishedAt: days(-ago), url: `https://example.com/demo/${slug}`, outlet });
  const items = [
    S('Wadi Al Noor Health Services invites bids for a contact centre operator', 'Wadi Al Noor Health Services has published a tender for an Arabic and English patient contact centre. Submission deadline ' + new Date(days(24)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '. Estimated value AED 38 million over three years.', 2, 'wadi-tender'),
    S('Wadi Al Noor Health Services invites bids for contact centre operator', 'The health services provider seeks a patient contact centre partner in Dubai and Abu Dhabi.', 1, 'wadi-tender-2', 'Demo Business Daily'),
    S('مركز الرمال لخدمات المواطنين يطلق برنامجاً لتوظيف الذكاء الاصطناعي في تجربة المتعاملين', 'أعلن مركز الرمال لخدمات المواطنين عن برنامج للتحول الرقمي وتجربة المتعاملين يشمل مساعداً افتراضياً باللغتين وخدمات استباقية خلال العام المقبل.', 3, 'rimal-ai', 'جريدة العرض'),
    S('Saraab Mobile appoints new Chief Customer Officer to lead service transformation', 'Saraab Mobile has appointed a new Chief Customer Officer who will lead the operator\'s customer service transformation and omnichannel programme.', 6, 'saraab-cco'),
    S('Lumen Pay raises $18 million Series A to expand to Saudi Arabia', 'Dubai fintech startup Lumen Pay raised $18 million in a Series A round and plans to launch in Riyadh next year, growing its customer support team.', 4, 'lumen-series-a'),
    S('Najm Air is hiring 120 customer service agents ahead of summer peak season', 'Najm Air is recruiting 120 customer service agents in Dubai to handle the summer peak season and new routes.', 5, 'najm-hiring'),
    S('Bayt Retail Group prepares for White Friday with new e-commerce platform', 'Bayt Retail Group will launch a new e-commerce platform before White Friday, expecting record online orders and customer queries.', 8, 'bayt-white-friday'),
    S('Qamar Digital Bank granted full digital bank licence', 'Qamar Digital Bank received regulatory approval for a full digital bank licence from the central bank and will launch retail accounts in Q1.', 10, 'qamar-licence'),
    S('Nimbus CX opens new 1,500-seat contact centre in Dubai', 'Competitor Nimbus CX (a fictional demo competitor) announced a new 1,500-seat multilingual contact centre in Dubai.', 2, 'competitor-nimbus', 'Demo Business Daily'),
    S('New cabinet resolution sets Emiratisation targets for outsourced customer service contracts', 'A new cabinet resolution requires outsourced customer service providers to meet Emiratisation ratios from 1 July 2027.', 7, 'regulation-emiratisation'),
    S('Tilal Insurance announces layoffs and restructuring of its operations', 'Tilal Insurance announced layoffs and restructuring across operations as part of a cost-cutting plan.', 3, 'tilal-layoffs'),
    S('Sahel Energy Utilities launches customer experience strategy with proactive services', 'Sahel Energy Utilities launched a new customer experience strategy focused on proactive services, digital channels and its customer happiness centre.', 12, 'sahel-cx'),
    S('Dune Logistics expands to Egypt and Jordan with new regional hub', 'Dune Logistics will expand into Cairo and Amman, adding a regional hub and bilingual customer operations.', 15, 'dune-expansion'),
    S('Oasis EdTech raises seed funding to scale its learning app', 'Oasis EdTech raised seed funding to scale its learning app across the UAE.', 20, 'oasis-seed'),
  ];
  const demoSrc: Record<string, string> = {};
  for (const name of ['Demo Gazette', 'Demo Business Daily', 'جريدة العرض']) {
    demoSrc[name] = (await sql`INSERT INTO sources (type, name, url, lang, category, quality, enabled, terms_checked, notes) VALUES ('rss', ${name + ' (fictional demo outlet)'}, ${'https://example.com/demo-feed/' + encodeURIComponent(name)}, ${name.startsWith('Demo') ? 'en' : 'ar'}, 'demo', 4, false, true, 'DEMO — fictional outlet, never crawled') ON CONFLICT (url) DO UPDATE SET name = EXCLUDED.name RETURNING id`)[0].id;
  }
  for (const it of items) await ingestItem({ sourceId: demoSrc[it.outlet] ?? null, ...it, origin: 'demo', isDemo: true, storeBody: false });
  // Link demo signals to the fictional orgs where the rules extracted a slightly different name
  await sql`UPDATE signals s SET org_id = o.id FROM organisations o WHERE s.is_demo AND o.is_demo AND s.org_id IS NULL AND s.title ILIKE '%' || split_part(o.name_en, ' ', 1) || ' ' || split_part(o.name_en, ' ', 2) || '%'`;
  await sql`UPDATE signals s SET org_id = ${O.rimal} WHERE s.is_demo AND s.title LIKE '%الرمال%'`;
  // Remove auto-created duplicate orgs from extraction (demo only) and rescore with access
  await sql`DELETE FROM organisations o WHERE NOT o.is_demo AND NOT EXISTS (SELECT 1 FROM signals WHERE org_id = o.id) AND NOT EXISTS (SELECT 1 FROM deals WHERE org_id = o.id)`;

  // ---- Relationships (Access Map) and public-role people (fictional)
  await sql`INSERT INTO relationships (user_id, person_name, person_title, org_id, strength, context, last_contact, is_demo) VALUES
    (${dir.id}, 'Hamad Al Suwaidi (fictional)', 'Director of Patient Experience', ${O.wadi}, 'strong', 'Former colleague', ${iso(-40)}, true),
    (${ae2.id}, 'Priya Menon (fictional)', 'VP Customer Operations', ${O.saraab}, 'medium', 'Met at a CX summit', ${iso(-90)}, true),
    (${exec.id}, 'Khalid Mansoori (fictional)', 'Chief Executive', ${O.najm}, 'strong', 'Board network', ${iso(-20)}, true),
    (${bdr.id}, 'Rania Fares (fictional)', 'Head of Support', ${O.lumen}, 'weak', 'LinkedIn connection', ${iso(-200)}, true)`;
  await sql`INSERT INTO people (name, title, org_id, source_url, is_demo) VALUES
    ('Hamad Al Suwaidi (fictional)', 'Director of Patient Experience', ${O.wadi}, 'https://example.com/demo/wadi-tender', true),
    ('Priya Menon (fictional)', 'VP Customer Operations', ${O.saraab}, 'https://example.com/demo/saraab-cco', true)`;
  const sigs = await sql`SELECT id FROM signals WHERE is_demo`;
  const { rescoreSignal } = await import('../lib/ingest/pipeline');
  for (const s of sigs) await rescoreSignal(s.id);
  await sql`UPDATE plays SET is_demo = true FROM signals s WHERE s.id = plays.signal_id AND s.is_demo`;

  // ---- Demo pipeline: open deals with a spread of health states, plus closed history
  const deal = async (v: Record<string, any>, hist: [string, number][] = []) => {
    const [d] = await sql`INSERT INTO deals ${sql({ currency: 'AED', country: 'AE', is_demo: true, created_by: dir.id, ...v } as any)} RETURNING id`;
    for (const [stage, ago] of hist) await sql`INSERT INTO deal_history (deal_id, user_id, field, old_value, new_value, at) VALUES (${d.id}, ${v.owner_id}, 'stage', NULL, ${stage}, ${days(-ago)})`;
    return d.id as string;
  };
  await deal({ org_id: O.sahel, title: 'Sahel Energy — customer happiness centre outsourcing', sector: 'utilities', tcv: 42_000_000, annual_value: 14_000_000, stage: 'proposal', owner_id: ae1.id, source: 'meridian', economic_buyer: 'CEO Office (fictional)', champion: 'Head of CX (fictional)', compelling_event: 'Strategy launch — go-live Q2', decision_date: iso(30), scope_recorded: true, next_step: 'Orals presentation', next_step_date: iso(5), expected_close: iso(35), owner_commit: true, stage_entered_at: days(-12), last_activity_at: days(-2) }, [['identified', 80], ['qualified', 60], ['engaged', 45], ['solutioning', 30], ['proposal', 12]]);
  await deal({ org_id: O.saraab, title: 'Saraab Mobile — omnichannel care + iX Hero pilot', sector: 'telecom', tcv: 26_000_000, annual_value: 8_700_000, stage: 'solutioning', owner_id: ae2.id, source: 'referral', economic_buyer: null, champion: 'VP Customer Operations (fictional)', compelling_event: 'New CCO 90-day plan', next_step: 'Workshop', next_step_date: iso(-6), expected_close: iso(55), close_date_pushes: 3, stage_entered_at: days(-70), last_activity_at: days(-26) }, [['identified', 150], ['qualified', 120], ['engaged', 100], ['solutioning', 70]]);
  const tilalDeal = await deal({ org_id: O.tilal, title: 'Tilal Insurance — claims contact centre', sector: 'bfsi', tcv: 9_500_000, annual_value: 3_200_000, stage: 'negotiation', owner_id: ae2.id, source: 'inbound', economic_buyer: 'COO (fictional)', champion: 'Claims Director (fictional)', compelling_event: 'Contract renewal with incumbent', decision_date: iso(20), scope_recorded: true, next_step: 'Commercial redline', next_step_date: iso(3), expected_close: iso(25), owner_commit: true, stage_entered_at: days(-15), last_activity_at: days(-4) }, [['identified', 90], ['qualified', 70], ['engaged', 55], ['solutioning', 40], ['proposal', 28], ['negotiation', 15]]);
  await deal({ org_id: O.bayt, title: 'Bayt Retail — White Friday surge capacity', sector: 'retail', track: 'enterprise', tcv: 3_800_000, annual_value: 3_800_000, stage: 'engaged', owner_id: bdr.id, source: 'meridian', economic_buyer: 'Head of E-commerce (fictional)', compelling_event: 'White Friday peak', next_step: 'Send sizing', next_step_date: iso(2), expected_close: iso(18), stage_entered_at: days(-8), last_activity_at: days(-1) }, [['identified', 20], ['qualified', 14], ['engaged', 8]]);
  await deal({ org_id: O.qamar, title: 'Qamar Digital Bank — launch-ready customer operations', sector: 'bfsi', tcv: 18_000_000, annual_value: 6_000_000, stage: 'qualified', owner_id: ae2.id, source: 'meridian', economic_buyer: null, compelling_event: null, expected_close: iso(70), stage_entered_at: days(-40), last_activity_at: days(-19) }, [['identified', 55], ['qualified', 40]]);
  await deal({ org_id: O.dune, title: 'Dune Logistics — bilingual support hub (Cairo)', sector: 'logistics', track: 'smb', tcv: 2_400_000, annual_value: 1_200_000, stage: 'identified', owner_id: bdr.id, source: 'event', next_step: 'Discovery call', next_step_date: iso(4), expected_close: iso(110), stage_entered_at: days(-5), last_activity_at: days(-3) }, [['identified', 5]]);
  await deal({ org_id: O.mirage, title: 'Mirage Properties — owner services desk', sector: 'real_estate', tcv: 5_200_000, annual_value: 1_700_000, stage: 'proposal', owner_id: ae2.id, source: 'other', economic_buyer: 'CFO (fictional)', champion: null, compelling_event: 'New community handovers', decision_date: null, scope_recorded: false, next_step: 'Chase feedback', next_step_date: iso(1), expected_close: iso(100), stage_entered_at: days(-60), last_activity_at: days(-10) }, [['identified', 120], ['qualified', 100], ['engaged', 85], ['solutioning', 75], ['proposal', 60]]);
  await deal({ org_id: O.wadi, title: 'Wadi Al Noor — CX health check (pre-RFP)', sector: 'healthcare', tcv: 600_000, annual_value: 600_000, stage: 'engaged', owner_id: ae1.id, source: 'meridian', economic_buyer: 'Director of Patient Experience (fictional)', compelling_event: 'Tender preparation', next_step: 'Present findings', next_step_date: iso(6), expected_close: iso(30), stage_entered_at: days(-9), last_activity_at: days(-2) }, [['identified', 25], ['qualified', 18], ['engaged', 9]]);
  // Signal against the Tilal deal (layoffs) — link it
  const [against] = await sql`SELECT id FROM signals WHERE is_demo AND signal_type = 'budget_freeze' LIMIT 1`;
  if (against) { await sql`UPDATE signals SET org_id = ${O.tilal} WHERE id = ${against.id}`; await sql`INSERT INTO deal_signals (deal_id, signal_id) VALUES (${tilalDeal}, ${against.id}) ON CONFLICT DO NOTHING`; }
  // Closed history (12 deals) so the realistic forecast uses historical rates
  const outcomes: [string, string | null, number, string][] = [['won', null, 4_000_000, 'meridian'], ['won', null, 7_500_000, 'referral'], ['lost', 'price', 3_000_000, 'other'], ['lost', 'incumbent', 12_000_000, 'other'], ['won', null, 2_200_000, 'meridian'], ['no_decision', 'timing', 1_800_000, 'inbound'], ['lost', 'capability', 900_000, 'event'], ['won', null, 5_400_000, 'meridian'], ['lost', 'relationship', 6_000_000, 'other'], ['won', null, 1_500_000, 'inbound'], ['lost', 'insourced', 2_600_000, 'meridian'], ['no_decision', 'cancelled', 3_300_000, 'other']];
  let i = 0;
  for (const [st, reason, v, src] of outcomes) {
    i++;
    const path = ['identified', 'qualified', 'engaged', 'solutioning', 'proposal', ...(st === 'won' ? ['negotiation'] : [])].slice(0, st === 'won' ? 6 : 3 + (i % 3));
    await deal({ org_id: null, title: `Closed demo deal #${i} (fictional)`, sector: ['government', 'bfsi', 'telecom', 'retail'][i % 4], tcv: v, annual_value: v / 3, stage: st, status: st, close_reason: reason, final_value: st === 'won' ? v : null, closed_at: days(-10 - i * 9), owner_id: [ae1.id, ae2.id, bdr.id][i % 3], source: src, close_date_pushes: i % 4 === 0 ? 1 : 0, expected_close: iso(-10 - i * 9), last_activity_at: days(-10 - i * 9), stage_entered_at: days(-10 - i * 9) },
      path.map((s, k) => [s, 200 - i * 9 - (path.length - k) * 15] as [string, number]).concat([[st, 10 + i * 9]]));
  }
  // Targets (DEMO — dummy values in USD)
  const q = quarterOf(), q2 = nextQuarter(q);
  await sql`INSERT INTO targets (quarter, country, sector, track, amount_usd, is_demo) VALUES (${q}, 'ALL', 'ALL', 'ALL', 9000000, true), (${q2}, 'ALL', 'ALL', 'ALL', 12000000, true), (${q}, 'AE', 'ALL', 'ALL', 9000000, true), (${q2}, 'AE', 'ALL', 'ALL', 12000000, true) ON CONFLICT DO NOTHING`;
  // Monday briefs for the demo leaders (this week)
  const { generateBriefFor } = await import('../lib/brief');
  for (const id of [exec.id, dir.id, ksa.id]) {
    const [u] = await sql`SELECT id, email, name, role, lang, timezone, work_week, currency, theme, countries, sectors, manager_id FROM users WHERE id = ${id}`;
    await generateBriefFor(u as any, true);
  }
  console.log('\n✔ Demo dataset loaded (fictional organisations; marked DEMO DATA).');
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
