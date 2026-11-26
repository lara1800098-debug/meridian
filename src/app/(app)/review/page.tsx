import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { PageHeader } from '@/components/ui';
import { ReviewPack } from '@/components/ReviewPack';
import { assertCan } from '@/lib/rbac';

export default async function Review() {
  const ctx = await pageCtx();
  assertCan(ctx.user, 'review');
  return (
    <Shell ctx={ctx} active="review">
      <PageHeader title={ctx.t('review.title')} subtitle={ctx.t('review.intro')} actions={<a className="btn-primary" href="/api/pdf?p=/print/review">{ctx.t('common.exportPdf')}</a>} />
      <ReviewPack ctx={ctx} />
    </Shell>
  );
}
