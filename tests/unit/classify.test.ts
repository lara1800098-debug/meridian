import { describe, expect, it } from 'vitest';
import { classify, extractAmount, extractDeadline, groundCheck } from '@/lib/engine/classify';

describe('rules classifier (EN)', () => {
  it('detects a published tender with amount and deadline', () => {
    const t = 'Abu Dhabi Health Authority invites bids for a contact centre operator. Submission deadline 15 January 2027. Estimated value AED 40 million.';
    const x = classify(t, [], );
    expect(x.signalType).toBe('tender');
    expect(x.sector).toBe('government');
    expect(x.country).toBe('AE');
    expect(x.amountUsd).toBeGreaterThan(10_000_000);
    expect(x.deadline).toBe('2027-01-15');
  });
  it('detects funding rounds as SMB track', () => {
    const x = classify('Dubai fintech startup PayLoop raises $12 million Series A to expand to Saudi Arabia', []);
    expect(['funding', 'cross_border']).toContain(x.signalType);
    expect(x.track).toBe('smb');
    expect(x.sector).toBe('fintech');
  });
  it('routes competitor-led stories to the competitor track', () => {
    const x = classify('Teleperformance opens new 2,000-seat contact centre in Dubai', ['Teleperformance']);
    expect(x.competitors).toEqual(['Teleperformance']);
    expect(x.signalType).toBe('competitor_move');
  });
  it('flags layoffs as a signal against deals', () => {
    expect(classify('Retailer announces layoffs and restructuring of its UAE operations', []).signalType).toBe('budget_freeze');
  });
  it('detects hiring intensity', () => {
    const x = classify('Noon is hiring 150 customer service agents in Dubai', []);
    expect(x.signalType).toBe('hiring_cs');
    expect(x.roles).toBe(150);
  });
});

describe('rules classifier (AR)', () => {
  it('detects Arabic tender and government sector', () => {
    const x = classify('هيئة الطرق والمواصلات في دبي تطرح مناقصة لتشغيل مركز اتصال سعادة المتعاملين بقيمة 25 مليون درهم', []);
    expect(x.signalType).toBe('tender');
    expect(x.sector).toBe('government');
    expect(x.country).toBe('AE');
    expect(x.amountUsd).toBeCloseTo(25e6 / 3.6725, -3);
  });
  it('detects Arabic government AI programme', () => {
    const x = classify('حكومة دبي تطلق برنامجاً لتوظيف الذكاء الاصطناعي في تجربة المتعاملين', []);
    expect(x.signalType).toBe('gov_cx_programme');
  });
});

describe('extractors', () => {
  it('parses compact amounts', () => {
    expect(extractAmount('a Dh2.5bn project')!.usd).toBeCloseTo(2.5e9 / 3.6725, -5);
    expect(extractAmount('USD 3m')!.usd).toBe(3e6);
    expect(extractAmount('no money here')).toBeNull();
  });
  it('only accepts future dates in a deadline context', () => {
    const now = new Date('2026-11-26');
    expect(extractDeadline('founded on 3 March 2027', now)).toBeNull();
    expect(extractDeadline('submission by 3 March 2027', now)).toBe('2027-03-03');
    expect(extractDeadline('deadline 3 March 2025', now)).toBeNull();
  });
  it('grounding check rejects text not in the source', () => {
    expect(groundCheck('Emirates NBD launches AI agent', ['Emirates NBD'])).toBe(true);
    expect(groundCheck('Emirates NBD launches AI agent', ['First Abu Dhabi Bank'])).toBe(false);
  });
});

describe('regressions from demo run', () => {
  it('leader appointment beats generic CX wording and is not taken as an org name', () => {
    const x = classify('Saraab Mobile appoints new Chief Customer Officer to lead service transformation and contact centre programme', []);
    expect(x.signalType).toBe('leader_appointed');
    expect(x.orgNames.some((n) => n.startsWith('Chief'))).toBe(false);
  });
  it('Arabic AI-in-customer-experience programme from a centre is a government CX programme', () => {
    expect(classify('مركز الرمال لخدمات المواطنين يطلق برنامجاً لتوظيف الذكاء الاصطناعي في تجربة المتعاملين', []).signalType).toBe('gov_cx_programme');
  });
});

describe('noise rejection', () => {
  it('general news is not a buying signal', () => {
    expect(classify('Two members of Syrian security forces killed in attack, state media says', []).relevant).toBe(false);
    expect(classify('Egypt fire update: death toll rises', []).relevant).toBe(false);
  });
  it('out-of-region stories are flagged XX', () => {
    expect(classify('Brazil announces new regulatory measures to curb household indebtedness', []).country).toBe('XX');
  });
  it('expansion needs business context', () => {
    expect(classify('Bayt Retail opens 12 new stores in Abu Dhabi', []).signalType).toBe('expansion');
    expect(classify('The festival launches tonight', []).relevant).toBe(false);
  });
});

describe('regulation needs CX/workforce/data context', () => {
  it('tax compliance news is not a CX regulation signal', () => {
    expect(classify('UAE Free Zones: Transfer pricing compliance key to retaining 0% corporate tax rate', []).signalType).not.toBe('regulation');
  });
  it('Emiratisation rule for outsourced services is', () => {
    expect(classify('New cabinet resolution sets Emiratisation targets for outsourced customer service contracts', []).signalType).toBe('regulation');
  });
});

describe('Arabic word-boundary', () => {
  it('"تنافسية" (competitiveness) is not the Nafis programme', () => {
    expect(classify('مشروع «شاهين» يعزز تنافسية البتروكيميائيات', []).signalType).not.toBe('regulation');
    expect(classify('برنامج نافس يرفع نسب التوطين في القطاع الخاص بالإمارات', []).signalType).toBe('regulation');
  });
});
