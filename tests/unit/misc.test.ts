import { describe, expect, it } from 'vitest';
import { agentsForSL, erlangC, size, smbProxy } from '@/lib/engine/sizer';
import { parseRobots, robotsAllows, parseFeed } from '@/lib/ingest/crawler';
import { fingerprint, similarity } from '@/lib/engine/dedup';
import { localWeekStart } from '@/lib/brief';
import { buildPlay, matchOffers } from '@/lib/engine/play';

describe('Erlang C sizer', () => {
  it('erlang C probability in (0,1)', () => { const p = erlangC(12, 10); expect(p).toBeGreaterThan(0); expect(p).toBeLessThan(1); });
  it('classic textbook case: 100 calls/h, 180s AHT, 80/20 → ~8 agents', () => { expect(agentsForSL(100, 180, 0.8, 20)).toBeGreaterThanOrEqual(7); expect(agentsForSL(100, 180, 0.8, 20)).toBeLessThanOrEqual(9); });
  it('size returns ordered ranges', () => {
    const r = size({ monthlyContacts: 60000, mix: { voice: 0.7, chat: 0.2, email: 0.1 }, ahtSec: 300, hoursPerDay: 12, daysPerWeek: 6, slTarget: 0.8, slSec: 20, shrinkage: 0.3, languages: 2 });
    expect(r.fte[0]).toBeLessThanOrEqual(r.fte[1]);
    expect(r.fte[0]).toBeGreaterThan(10);
  });
  it('smb proxy explains assumptions', () => { const r = smbProxy({ customers: 50000, csRoles: 10 }); expect(r.monthlyContacts).toBeGreaterThan(0); expect(r.assumptions).toHaveLength(2); });
});

describe('robots.txt', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/press\n\nUser-agent: BadBot\nDisallow: /');
  it('respects disallow and longest-match allow', () => {
    expect(robotsAllows(rules, '/news/1')).toBe(true);
    expect(robotsAllows(rules, '/private/x')).toBe(false);
    expect(robotsAllows(rules, '/private/press/1')).toBe(true);
  });
});

describe('feed parsing + dedup', () => {
  it('parses Google-News style RSS and splits outlet', () => {
    const xml = '<rss><channel><item><title>Dubai launches AI customer service - Gulf Today</title><link>https://news.google.com/x</link><pubDate>Tue, 24 Nov 2026 08:00:00 GMT</pubDate><description>&lt;a&gt;Dubai launches&lt;/a&gt;</description></item></channel></rss>';
    const [i] = parseFeed(xml);
    expect(i.title).toBe('Dubai launches AI customer service');
    expect(i.outlet).toBe('Gulf Today');
  });
  it('same story from two outlets is similar; different stories are not', () => {
    expect(similarity('Dubai Police launches AI-powered customer happiness centre', 'Dubai Police launch AI powered customer happiness centre - Khaleej Times')).toBeGreaterThan(0.55);
    expect(similarity('Dubai Police launches AI centre', 'Etisalat raises prices')).toBeLessThan(0.3);
    expect(fingerprint('A B C - Outlet')).toBe(fingerprint('C B A'));
  });
});

describe('work-week aware Monday brief', () => {
  it('UAE week starts Monday, KSA Sunday', () => {
    const sun = new Date('2026-11-29T05:00:00Z'); // Sunday 09:00 Dubai / 08:00 Riyadh
    expect(localWeekStart('Asia/Dubai', 'mon-fri', sun).isStartDay).toBe(false);
    expect(localWeekStart('Asia/Riyadh', 'sun-thu', sun).isStartDay).toBe(true);
    expect(localWeekStart('Asia/Dubai', 'mon-fri', new Date('2026-11-30T03:00:00Z'))).toMatchObject({ weekStart: '2026-11-30', isStartDay: true, localHour: 7 });
  });
});

describe('play builder', () => {
  const offer = { key: 'managed_cc', name_en: 'Managed CC', name_ar: 'مركز', pitch_en: 'p', pitch_ar: 'ع', ideal_signals: ['tender'], ideal_sectors: ['government'], ideal_types: ['government'], proof_points: [{ text: 'proof', url: 'u' }] };
  it('matches offers by signal type', () => { expect(matchOffers({ signalType: 'tender', sector: 'government', orgType: 'government' }, [offer])).toHaveLength(1); });
  it('why-now bullets all cite a snapshot and outreach never invents an org', () => {
    const p = buildPlay({ signalType: 'tender', track: 'enterprise', sector: 'government', country: 'AE', orgType: 'government', sizeBand: 'unknown', orgName: null, orgNameAr: null, title: 'Tender for contact centre', titleEn: null, amountText: 'AED 5m', amountUsd: 1.3e6, deadline: '2027-01-01', roles: null, sources: [{ snapshotId: 'snap1', title: 't', url: 'u', publishedAt: null, outlet: 'WAM' }], scores: {} as any, confidence: 'low', competitors: [] }, [offer], []);
    expect(p.why_now.every((w) => w.snapshotId === 'snap1')).toBe(true);
    expect(p.headline).toContain('This organisation');
    expect(p.risks.some((r) => r.en.includes('not confirmed'))).toBe(true);
    expect(p.outreach.ar.email.body).toContain('تحية طيبة');
  });
});

import { calibrate } from '@/lib/engine/calibrate';
describe('calibration', () => {
  it('learns that intent predicts conversion and does not hurt AUC', () => {
    const data = Array.from({ length: 200 }, (_, i) => { const intent = (i * 37) % 100, fit = (i * 53) % 100; return { x: [fit, intent, 50, 30] as [number, number, number, number], y: (intent > 60 ? 1 : 0) as 0 | 1 }; });
    const r = calibrate(data, { fit: 0.4, intent: 0.2, timing: 0.2, access: 0.2 })!;
    expect(r.weights.intent).toBeGreaterThan(r.weights.fit);
    expect(r.aucAfter!).toBeGreaterThanOrEqual(r.aucBefore!);
  });
  it('refuses with too little data', () => { expect(calibrate([], { fit: 1, intent: 1, timing: 1, access: 1 })).toBeNull(); });
});

import { extractTender, goNoGo } from '@/lib/engine/tender';
describe('tender reader', () => {
  const doc = `REQUEST FOR PROPOSAL — Contact Centre Services. Issued by the Contracting Authority: Fictional Health Services.
Scope of work: inbound voice, email and WhatsApp customer service for patients.
Expected volumes: 45,000 calls per month.
Services must be delivered in Arabic and English.
Service level: 80% of calls answered within 20 seconds; abandonment rate below 5%.
Penalties: service credits of 2% per SLA breach.
Contract term: for a period of 3 years.
Evaluation criteria: 70% technical and 30% commercial.
Emiratisation: the provider shall meet NAFIS targets.
Data must be hosted within the UAE.
Bidders must hold ISO 27001 and COPC certification.
Clarification questions deadline: 10/12/2026.
Submission deadline: 15/01/2027 via the e-procurement portal.`;
  it('extracts cited fields', () => {
    const f = extractTender(doc);
    expect(f.languages.value).toContain('arabic');
    expect(f.certifications.value).toMatch(/ISO 27001/);
    expect(f.submission_deadline.value).toBe('15/01/2027');
    expect(doc).toContain(f.slas.quote!);
  });
  it('go/no-go flags local content, residency and certifications for review', () => {
    const g = goNoGo(extractTender(doc), new Date('2026-11-26'));
    const by = Object.fromEntries(g.checks.map((c) => [c.item, c.status]));
    expect(by['Submission deadline']).toBe('ok');
    expect(by['Local content / nationalisation']).toBe('review');
    expect(by['Data residency / security']).toBe('review');
    expect(['review', 'go']).toContain(g.recommendation);
  });
});

describe('news sitemap parsing', () => {
  it('reads news:title and publication date', () => {
    const xml = '<urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"><url><loc>https://example.com/a</loc><news:news><news:publication><news:name>Demo</news:name></news:publication><news:publication_date>2026-11-25T08:00:00Z</news:publication_date><news:title>Ministry launches AI customer service</news:title></news:news></url></urlset>';
    const [i] = parseFeed(xml);
    expect(i.title).toBe('Ministry launches AI customer service');
    expect(i.outlet).toBe('Demo');
  });
});
