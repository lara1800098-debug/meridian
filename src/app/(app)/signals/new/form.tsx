'use client';
import { useActionState } from 'react';
export function AddSignalForm({ action, labels }: { action: any; labels: Record<string, string> }) {
  const [state, run, pending] = useActionState(action, undefined as any);
  return (
    <form action={run} className="space-y-4">
      <label className="block"><span className="label">{labels.pasteUrl}</span><input name="url" type="url" className="input" placeholder="https://" dir="ltr" /></label>
      <label className="block"><span className="label">{labels.uploadDoc}</span><input name="file" type="file" accept=".pdf,.docx,.txt" className="input" /></label>
      {state?.error && <p role="alert" className="rounded-ctl bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? '…' : labels.submit}</button>
    </form>
  );
}
