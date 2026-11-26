/** Extract people named with a business title in article text (EN + AR). Public business role only; no contact details. */
export type NamedPerson = { name: string; title: string };

const EN_TITLE = String.raw`(?:Group\s+)?(?:Chief Executive Officer|CEO|Chief [A-Z][a-z]+(?: [A-Z][a-z]+)? Officer|C[DTXIO]O|Managing Director|Director[- ]General|Executive Director|Deputy Director[- ]General|General Manager|Director of [A-Z][\w &]+|Head of [A-Z][\w &]+|Chairman|Chairperson|Vice Chairman|Founder(?: and CEO)?|Co-founder(?: and CEO)?|President|Undersecretary|Assistant Undersecretary|Secretary[- ]General|Minister of [A-Z][\w &]+)`;
const NAME = String.raw`((?:Dr\.?|Eng\.?|H\.?E\.?|Mr\.?|Ms\.?|Mrs\.?)\s+)?([A-Z][a-z]+(?:[ -](?:al|Al|bin|Bin|bint|Bint|Abu|El|el|[A-Z][a-z'’]+)){1,4})`;
// "Name, Title of Org" | "Name, the Title" | "Title Name"
const EN1 = new RegExp(`${NAME},?\\s+(?:the\\s+)?(${EN_TITLE})`, 'g');
const EN2 = new RegExp(`(${EN_TITLE}),?\\s+${NAME}`, 'g');
const ROYAL = /^(Sheikh|Shaikh|HH|His|Her|Prince|Princess|King|Crown)/;
const NOT_NAME = /^(The|This|That|In|On|At|For|With|Abu Dhabi|Dubai|Saudi|United|Emirates|Group|Company|Ministry|Department|Authority)\b|\b(Platform|Solutions|Mobility|Health|Group|Bank|Services|Digital|Rail|Airways|Holding|Capital|Ventures|Technologies|Systems|Network|Centre|Center|Council|Office|Fund)\b/;

const AR_TITLE = String.raw`(?:الرئيس التنفيذي(?: لل[؀-ۿ]+)?|المدير التنفيذي|المدير العام|مدير عام [؀-ۿ]+|رئيس مجلس الإدارة|نائب رئيس مجلس الإدارة|المؤسس|وكيل وزارة [؀-ۿ]+|الوكيل المساعد|مدير إدارة [؀-ۿ]+|الأمين العام)`;
const AR = new RegExp(String.raw`(?:سعادة|معالي|الدكتور|الدكتورة|المهندس|المهندسة)?\s*([؀-ۿ]+(?:\s[؀-ۿ]+){1,3})،\s*(${AR_TITLE})`, 'g');
const AR_STOP = /^(قال|وقال|أكد|وأكد|أوضح|وأوضح|أشار|وأشار|من|في|على|إلى|عن|مع|بحضور|سمو|الشيخ)/;

export function extractPeople(text: string, max = 6): NamedPerson[] {
  const out = new Map<string, NamedPerson>();
  const add = (name: string, title: string) => {
    name = name.replace(/\s+/g, ' ').trim().replace(/^(?:(?:و?قال|و?أكد|و?أوضح|و?أشار|سعادة|معالي|الدكتور|الدكتورة|المهندس|المهندسة)\s+)+/, '').replace(/^(?:(?:His|Her)\s+)?(?:Excellency|Dr\.?|Eng\.?|H\.?E\.?)\s+/g, '').replace(/^(?:Excellency|Dr\.?)\s+/, ''); title = title.replace(/\s+/g, ' ').trim().replace(/\s+at\s+.*$/, '');
    if (name.split(' ').length < 2 || name.length > 50 || ROYAL.test(name) || NOT_NAME.test(name) || AR_STOP.test(name)) return;
    if (!out.has(name.toLowerCase())) out.set(name.toLowerCase(), { name, title });
  };
  for (const m of text.matchAll(EN1)) add(m[2], m[3]);
  for (const m of text.matchAll(EN2)) add(m[3], m[1]);
  for (const m of text.matchAll(AR)) add(m[1], m[2]);
  return [...out.values()].slice(0, max);
}
