import { describe, it, expect } from 'vitest';
import { buyerCheck, amountUsd } from '../../src/lib/engine/clean';

const ok = ['managed_cc'];
describe('buyerCheck — clean sales logos only', () => {
  it('rejects market news with no named organisation', () => {
    expect(buyerCheck({ org: null, title: 'Abu Dhabi ranks third globally in AI cities index', type: 'gov_cx_programme', offers: ok }).reason).toBe('no_org');
  });
  it('rejects umbrella governments and places', () => {
    expect(buyerCheck({ org: 'Abu Dhabi Government', title: 'x', type: 'gov_cx_programme', offers: ok }).reason).toBe('generic_org');
    expect(buyerCheck({ org: 'Saudi Arabia', title: 'x', type: 'regulation', offers: ok }).reason).toBe('generic_org');
  });
  it('rejects investors and fund closes', () => {
    expect(buyerCheck({ org: 'Iliad Partners', title: "ADGM's Iliad Partners closes start-up fund", type: 'funding', offers: ok }).reason).toBe('investor');
    expect(buyerCheck({ org: 'Outliers Ventures', title: 'x', type: 'funding', offers: ok }).reason).toBe('investor');
  });
  it('rejects small funding rounds and rounds with no amount', () => {
    expect(buyerCheck({ org: 'Connect Money', title: "Egypt's Connect Money raises $3.5 million pre-Series A", type: 'funding', offers: ok }).reason).toBe('too_small');
    expect(buyerCheck({ org: 'Chipverse', title: 'Chipverse secures pre-seed funding', type: 'funding', offers: ok }).reason).toBe('too_small');
    expect(buyerCheck({ org: 'Tabby', title: 'Tabby raises $160 million Series E', type: 'funding', offers: ok }).clean).toBe(true);
  });
  it('rejects promotional pieces, no-offer items and construction awards', () => {
    expect(buyerCheck({ org: 'KEZAD Group', title: 'KEZAD Group: A hub for industrial growth', type: 'regional_hq', offers: ok }).reason).toBe('advertorial');
    expect(buyerCheck({ org: 'Nakheel', title: 'Nakheel awards Dh1.4bn contract to build 176 villas', type: 'tender_award', offers: [] }).reason).toBe('no_offer');
    expect(buyerCheck({ org: 'Nakheel', title: 'Nakheel awards Dh1.4bn contract to build 176 villas', type: 'tender_award', offers: ok }).reason).toBe('not_cx');
  });
  it('keeps named buyers with a sellable signal', () => {
    expect(buyerCheck({ org: 'Dubai Islamic Bank', title: 'Dubai Islamic Bank to acquire Emirates Islamic', type: 'mna', offers: ['cx_strategy'] }).clean).toBe(true);
    expect(buyerCheck({ org: 'Ministry of Tourism', title: 'Ministry of Tourism makes 5 digital services available', type: 'gov_cx_programme', offers: ok }).clean).toBe(true);
  });
  it('parses headline amounts to USD', () => {
    expect(amountUsd('raises $3.5 million')).toBeCloseTo(3.5e6);
    expect(Math.round(amountUsd('Dh1.4bn contract')!)).toBe(Math.round(1.4e9 / 3.6725));
    expect(amountUsd('secures new investment')).toBeNull();
  });
});
