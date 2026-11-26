import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, PageHeader } from '@/components/ui';
import { AddSignalForm } from './form';
import { addSignal } from '../actions';

export default async function NewSignal() {
  const ctx = await pageCtx();
  const { t } = ctx;
  return (
    <Shell ctx={ctx} active="signals">
      <PageHeader title={t('signals.add')} subtitle="Meridian reads public pages only, respects robots.txt and never logs in anywhere." />
      <Card className="max-w-xl"><AddSignalForm action={addSignal} labels={{ pasteUrl: t('signals.pasteUrl'), uploadDoc: t('signals.uploadDoc'), submit: t('signals.submit') }} /></Card>
    </Shell>
  );
}
