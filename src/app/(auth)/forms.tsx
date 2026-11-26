'use client';
import { useActionState } from 'react';

type Labels = Record<string, string>;
type Action = (s: unknown, fd: FormData) => Promise<{ error?: string } | void>;

export function AuthForm({ action, fields, submit, labels, hidden }: { action: Action; fields: { name: string; type: string; label: string; autoComplete?: string; inputMode?: 'numeric' }[]; submit: string; labels: Labels; hidden?: Record<string, string> }) {
  const [state, run, pending] = useActionState(action as any, undefined as any);
  return (
    <form action={run} className="space-y-4">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f) => (
        <label key={f.name} className="block">
          <span className="label">{f.label}</span>
          <input className="input" name={f.name} type={f.type} required autoComplete={f.autoComplete} inputMode={f.inputMode} dir={f.type === 'email' ? 'ltr' : undefined} />
        </label>
      ))}
      {state?.error && <p role="alert" className="rounded-ctl bg-bad/10 px-3 py-2 text-sm text-bad">{labels[state.error] ?? state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{submit}</button>
    </form>
  );
}
