import Link from 'next/link';
import { sql } from '@/db';
import type { Ctx } from '@/lib/ctx';
import { matchOffers, type Offer } from '@/lib/engine/play';
import { date } from '@/lib/format';
import { FactTag, SuggestTag } from './ui';

const PAINS: Record<string, { en: string; ar: string }> = {
  tender: { en: 'Formal procurement with fixed SLAs and evaluation weightings', ar: 'مشتريات رسمية بمستويات خدمة ومعايير تقييم محددة' },
  cc_transformation: { en: 'Modernising contact-centre operations while keeping service levels', ar: 'تحديث مركز الاتصال مع الحفاظ على مستويات الخدمة' },
  gov_cx_programme: { en: 'Delivering on a public CX / digital commitment with visible results', ar: 'تحقيق التزام علني بتجربة المتعاملين بنتائج ملموسة' },
  service_ratings: { en: 'Improving rated service channels quickly', ar: 'تحسين قنوات الخدمة المقيّمة بسرعة' },
  regulation: { en: 'Compliance with new rules (e.g. Emiratisation, data residency)', ar: 'الامتثال لتشريعات جديدة (مثل التوطين وإقامة البيانات)' },
  regional_hq: { en: 'Standing up bilingual customer operations fast in a new market', ar: 'تأسيس عمليات عملاء ثنائية اللغة بسرعة في سوق جديد' },
  hiring_cs: { en: 'Recruiting and retaining service staff at speed', ar: 'توظيف موظفي الخدمة والاحتفاظ بهم بسرعة' },
  funding: { en: 'Scaling support without slowing growth', ar: 'توسيع الدعم دون إبطاء النمو' },
  expansion: { en: 'Service capacity keeping up with expansion', ar: 'مواكبة سعة الخدمة للتوسع' },
  leader_appointed: { en: 'A new leader setting a 90-day agenda', ar: 'قيادي جديد يضع خطة أول 90 يوماً' },
  new_licence: { en: 'Launching regulated customer operations correctly first time', ar: 'إطلاق عمليات عملاء منظَّمة بشكل صحيح من البداية' },
};
const QUESTIONS = {
  en: ['What does success look like for your customers 12 months from now?', 'Which customer journeys are under the most pressure today, and how do you measure it?', 'How are you balancing AI self-service with the human, Arabic-language experience?'],
  ar: ['كيف يبدو النجاح لعملائكم بعد 12 شهراً من الآن؟', 'ما رحلات المتعاملين الأكثر ضغطاً اليوم، وكيف تقيسونها؟', 'كيف توازنون بين الخدمة الذاتية بالذكاء الاصطناعي والتجربة البشرية باللغة العربية؟'],
};
const AVOID = {
  en: ['Quoting prices or committing to FTE numbers before scope is clear', 'Naming other clients without permission', 'Assuming budget is approved — ask'],
  ar: ['ذكر أسعار أو أعداد موظفين قبل وضوح النطاق', 'ذكر أسماء عملاء آخرين دون إذن', 'افتراض اعتماد الميزانية — اسأل'],
};

export async function MeetingBrief({ ctx, orgId, print }: { ctx: Ctx; orgId: string; print?: boolean }) {
  const { t, lang } = ctx;
  const [o] = await sql`SELECT o.*, p.name_en AS parent FROM organisations o LEFT JOIN organisations p ON p.id = o.parent_id WHERE o.id = ${orgId}`;
  if (!o) return null;
  const sigs = await sql`SELECT s.id, s.title, s.title_en, s.signal_type, s.first_seen_at, s.confidence, (SELECT snapshot_id FROM signal_sources WHERE signal_id = s.id LIMIT 1) AS snap FROM signals s WHERE s.org_id = ${orgId} ORDER BY s.first_seen_at DESC LIMIT 6`;
  const people = await sql`SELECT * FROM people WHERE org_id = ${orgId} ORDER BY seen_at DESC LIMIT 6`;
  const offers = (await sql`SELECT * FROM offers WHERE active`) as unknown as Offer[];
  const types = [...new Set(sigs.map((s) => s.signal_type))];
  const rec = matchOffers({ signalType: types[0] ?? 'expansion', sector: o.sector, orgType: o.org_type } as any, offers, 2);
  const proof = rec.flatMap((r) => r.proof_points)[0];
  const H = ({ children, s }: { children: React.ReactNode; s?: boolean }) => <h2 className="mb-1.5 mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-a1">{children}{s === undefined ? null : s ? <SuggestTag t={t} /> : <FactTag t={t} />}</h2>;
  return (
    <article className="text-sm">
      <H s={false}>{lang === 'ar' ? 'من هم' : 'Who they are'}</H>
      <p>{lang === 'ar' ? o.name_ar ?? o.name_en : o.name_en}{o.name_ar && lang !== 'ar' ? ` (${o.name_ar})` : ''} — {t(`orgTypes.${o.org_type}`)}, {t(`sectors.${o.sector}`)}, {t(`countries.${o.country}`)}{o.parent ? ` · ${t('orgs.parent')}: ${o.parent}` : ''}.{o.website ? ` ${o.website}` : ''}</p>
      <H s={false}>{lang === 'ar' ? 'المؤشرات الأخيرة والأولويات' : 'Recent signals & priorities'}</H>
      <ul className="list-disc space-y-1 ps-5">{sigs.map((s) => <li key={s.id}>{lang === 'en' ? s.title_en ?? s.title : s.title} <span className="text-xs text-ink-3">({t(`signalTypes.${s.signal_type}`)}, {date(s.first_seen_at, lang)}{print ? '' : ''})</span> {!print && <Link className="text-xs text-brand-a1 underline" href={`/signals/${s.id}`}>{t('common.source')}</Link>}</li>)}{!sigs.length && <li>{t('common.unknown')}</li>}</ul>
      <H s>{lang === 'ar' ? 'نقاط الألم المرجحة' : 'Likely pain points'}</H>
      <ul className="list-disc ps-5">{types.filter((x) => PAINS[x]).slice(0, 3).map((x) => <li key={x}>{PAINS[x][lang]}</li>)}{!types.some((x) => PAINS[x]) && <li>{t('common.unknown')}</li>}</ul>
      <H s>{lang === 'ar' ? 'الحل المناسب ومثال النجاح' : 'Relevant Concentrix offer & proof point'}</H>
      <ul className="list-disc ps-5">{rec.map((r) => <li key={r.key}><b>{lang === 'ar' ? r.name_ar : r.name_en}</b> — {lang === 'ar' ? r.pitch_ar : r.pitch_en}</li>)}</ul>
      {proof && <p className="mt-1 text-xs">{t('plays.proof')}: {proof.text}</p>}
      <H s>{lang === 'ar' ? 'ثلاثة أسئلة ذكية' : 'Three smart questions'}</H>
      <ol className="list-decimal ps-5">{QUESTIONS[lang].map((q) => <li key={q}>{q}</li>)}</ol>
      <H s>{lang === 'ar' ? 'ما يجب تجنبه' : 'Things to avoid'}</H>
      <ul className="list-disc ps-5">{AVOID[lang].map((q) => <li key={q}>{q}</li>)}</ul>
      <H s={false}>{lang === 'ar' ? 'الحضور (أدوار مهنية عامة)' : 'Attendees — public business roles'}</H>
      <ul className="list-disc ps-5">{people.map((p) => <li key={p.id}>{p.name}{p.title ? `, ${p.title}` : ''} <span className="text-xs text-ink-3">({t('common.source')}: {p.source_url.startsWith('http') ? new URL(p.source_url).hostname : p.source_url}, {date(p.seen_at, lang)})</span></li>)}{!people.length && <li>{t('common.unknown')}</li>}</ul>
    </article>
  );
}
