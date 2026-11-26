import { describe, expect, it } from 'vitest';
import { extractPeople } from '@/lib/engine/people';

describe('people named in the news (business role only)', () => {
  it('finds "Name, Title" and "Title Name"', () => {
    const p = extractPeople('“We are scaling fast,” said Ahmed Al Mansoori, Chief Executive Officer of Vision Makers. Head of Customer Experience Sara Khan added that the app will relaunch.');
    expect(p).toEqual(expect.arrayContaining([{ name: 'Ahmed Al Mansoori', title: 'Chief Executive Officer' }, { name: 'Sara Khan', title: 'Head of Customer Experience' }]));
  });
  it('skips royals and rulers (not sales contacts)', () => {
    expect(extractPeople('Sheikh Mohammed bin Rashid, Vice President of the UAE, approved the plan.')).toEqual([]);
  });
  it('reads Arabic titles', () => {
    const p = extractPeople('وقال سعادة محمد أحمد الكعبي، المدير العام للهيئة، إن الخدمات الرقمية تتوسع.');
    expect(p[0]?.name).toBe('محمد أحمد الكعبي');
    expect(p[0]?.title).toContain('المدير العام');
  });
});
describe('people noise', () => {
  it('drops product/org names and honorifics', () => {
    const p = extractPeople('Kareem Shaheen, CEO of the Digital Health Solutions Platform, joined. His Excellency Dr Mohamed Al Askar, Director General, spoke.');
    expect(p.map((x) => x.name)).toEqual(['Kareem Shaheen', 'Mohamed Al Askar']);
  });
});
