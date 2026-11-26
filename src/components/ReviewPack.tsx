import Link from 'next/link';
import { sql } from '@/db';
import type { Ctx } from '@/lib/ctx';
import { loadDeals, stages } from '@/lib/data/deals';
import { money } from '@/lib/format';
import { reasonText } from '@/lib/view';
import { HealthBadge } from './ui';

const Q: Record<string, { en: string; ar: string }> = {
  noActivity: { en: 'When did you last speak to the buyer, and what did they say?', ar: 'متى تحدثت آخر مرة مع صاحب القرار، وماذا قال؟' },
  noNextStep: { en: 'What is the next step, with whom, and on what date?', ar: 'ما الخطوة التالية، ومع من، وفي أي تاريخ؟' },
  nextStepPast: { en: 'The agreed next step date passed — did it happen?', ar: 'انقضى موعد الخطوة التالية — هل تمت؟' },
  pushed: { en: 'Why has the close date moved again? What would make it real?', ar: 'لماذا تأجل تاريخ الإغلاق مجدداً؟ وما الذي يجعله واقعياً؟' },
  stuck: { en: 'What is blocking progress to the next stage?', ar: 'ما الذي يعيق الانتقال إلى المرحلة التالية؟' },
  criteria: { en: 'Which entry criteria can we close this week?', ar: 'أي معايير الدخول يمكن استكمالها هذا الأسبوع؟' },
  missingEB: { en: 'Who signs? Have we met them?', ar: 'من يوقّع؟ وهل التقينا به؟' },
  missingChampion: { en: 'Who inside is selling for us when we are not in the room?', ar: 'من يدافع عنا داخل الجهة في غيابنا؟' },
  missingEvent: { en: 'What happens to them if they do nothing?', ar: 'ماذا سيحدث لهم إن لم يتخذوا أي إجراء؟' },
  missingDecision: { en: 'When and how will the decision be made?', ar: 'متى وكيف سيُتخذ القرار؟' },
  valueJump: { en: 'What changed in scope to move the value?', ar: 'ما الذي تغيّر في النطاق ليغيّر القيمة؟' },
  against: { en: 'Have you confirmed the impact of the external news with the client?', ar: 'هل تأكدت من أثر الخبر الخارجي مع العميل؟' },
  closePast: { en: 'The close date has passed — close it, or re-date it honestly.', ar: 'تجاوز تاريخ الإغلاق — أغلق الصفقة أو حدّد تاريخاً واقعياً.' },
};

export async function ReviewPack({ ctx, print }: { ctx: Ctx; print?: boolean }) {
  const { t, lang, fx, cur, user } = ctx;
  const st = await stages();
  const stageName = (k: string) => { const s = st.find((x) => x.key === k); return s ? (lang === 'ar' ? s.name_ar : s.name_en) : k; };
  const deals = (await loadDeals(user, fx, { status: 'open' }));
  const ids = deals.map((d) => d.id);
  const changes = ids.length ? await sql`SELECT h.*, u.name FROM deal_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.deal_id = ANY(${ids}) AND h.at > now() - interval '7 days' ORDER BY h.at DESC` : [];
  const changed = new Set(changes.map((c) => c.deal_id));
  const list = deals.filter((d) => d.health.status !== 'healthy' || changed.has(d.id)).sort((a, b) => b.health.points - a.health.points || b.tcv_usd - a.tcv_usd).slice(0, 15);
  return (
    <div className="space-y-4">
      {list.map((d) => {
        const ch = changes.filter((c) => c.deal_id === d.id);
        const qs = [...new Set(d.health.reasons.map((r) => r.code))].filter((c) => Q[c]).slice(0, 3);
        return (
          <section key={d.id} className="break-inside-avoid rounded-card border border-line p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{print ? d.title : <Link className="hover:underline" href={`/deals/${d.id}`}>{d.title}</Link>}</h3>
              <span className="font-num text-sm">{money(d.tcv_usd, cur, fx, lang)} · {stageName(d.stage)} · {d.owner_name}</span>
            </div>
            <div className="mt-1"><HealthBadge status={d.health.status} t={t} /></div>
            <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
              <div><div className="label">{t('deals.health')}</div><ul className="list-disc ps-4 text-xs">{d.health.reasons.slice(0, 4).map((r, i) => <li key={i}>{reasonText(r, t, lang, stageName)}</li>)}{!d.health.reasons.length && <li>✓</li>}</ul></div>
              <div><div className="label">{t('review.changed')}</div><ul className="list-disc ps-4 text-xs">{ch.slice(0, 4).map((c) => <li key={c.id}>{c.field === 'note' ? `“${c.new_value}”` : `${c.field}: ${c.old_value ?? '∅'} → ${c.new_value ?? '∅'}`} <span className="text-ink-3">({c.name})</span></li>)}{!ch.length && <li className="text-ink-3">{t('common.none')}</li>}</ul></div>
              <div><div className="label">{t('review.questions')}</div><ul className="list-disc ps-4 text-xs">{qs.map((c) => <li key={c}>{Q[c][lang]}</li>)}</ul></div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
