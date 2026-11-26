import { pageCtx } from '@/lib/ctx';
import { ReviewPack } from '@/components/ReviewPack';
import PrintFrame from '../PrintFrame';
import { assertCan } from '@/lib/rbac';
export default async function PrintReview() {
  const ctx = await pageCtx();
  assertCan(ctx.user, 'review');
  return <PrintFrame t={ctx.t} lang={ctx.lang} title={ctx.t('review.title')} subtitle={ctx.user.name}><ReviewPack ctx={ctx} print /></PrintFrame>;
}
