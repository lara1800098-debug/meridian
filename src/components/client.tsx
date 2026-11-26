'use client';
import { useState } from 'react';

export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn-ghost !px-2.5 !py-1 text-xs" onClick={async () => { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}>
      {ok ? done : label}
    </button>
  );
}

export function Tabs({ tabs }: { tabs: { id: string; label: string; content: React.ReactNode }[] }) {
  const [a, setA] = useState(tabs[0]?.id);
  return (
    <div>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={a === t.id} onClick={() => setA(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${a === t.id ? 'border-brand-a1 font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => <div key={t.id} role="tabpanel" hidden={a !== t.id}>{t.content}</div>)}
    </div>
  );
}

export function ConfirmSubmit({ label, msg, className }: { label: string; msg: string; className?: string }) {
  return <button className={className ?? 'btn-danger'} onClick={(e) => { if (!confirm(msg)) e.preventDefault(); }}>{label}</button>;
}

export function PrintButton({ label }: { label: string }) {
  return <button type="button" className="btn-ghost" onClick={() => window.print()}>{label}</button>;
}
