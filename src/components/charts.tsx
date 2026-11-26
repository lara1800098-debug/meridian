'use client';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { tokens } from '@theme/tokens';

/** Resolve brand tokens from CSS variables at runtime so charts follow theme + brand swaps. */
function useColors() {
  const [c, setC] = useState<{ series: string[]; ink: string; line: string; surface: string }>({ series: ['#888'], ink: '#555', line: '#ddd', surface: '#fff' });
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const v = (n: string) => `rgb(${cs.getPropertyValue(n).trim().split(/\s+/).join(',')})`;
      setC({ series: tokens.chartSeries.map(v), ink: v('--ink-3'), line: v('--line'), surface: v('--surface') });
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return c;
}

const fmt = (v: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

export function HBar({ data, height = 220, unit = '' }: { data: { name: string; value: number; href?: string }[]; height?: number; unit?: string }) {
  const c = useColors();
  return (
    <div style={{ height }} role="img" aria-label={data.map((d) => `${d.name}: ${unit}${fmt(d.value)}`).join(', ')}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <XAxis type="number" tickFormatter={(v) => unit + fmt(v)} stroke={c.ink} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={120} stroke={c.ink} fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v: any) => unit + fmt(Number(v))} contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="value" isAnimationActive={false} barSize={14} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: c.ink, formatter: (v: any) => unit + fmt(Number(v)) }}>
            {data.map((_, i) => <Cell key={i} fill={c.series[0]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Stacked({ data, keys, height = 220, unit = '' }: { data: Record<string, any>[]; keys: { key: string; label: string }[]; height?: number; unit?: string }) {
  const c = useColors();
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid stroke={c.line} vertical={false} />
          <XAxis dataKey="name" stroke={c.ink} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => unit + fmt(v)} stroke={c.ink} fontSize={11} tickLine={false} axisLine={false} width={56} />
          <Tooltip formatter={(v: any) => unit + fmt(Number(v))} contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {keys.map((k, i) => <Bar key={k.key} dataKey={k.key} name={k.label} stackId="a" isAnimationActive={false} fill={c.series[i % c.series.length]} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Lines({ data, keys, height = 240, unit = '' }: { data: Record<string, any>[]; keys: { key: string; label: string; dashed?: boolean }[]; height?: number; unit?: string }) {
  const c = useColors();
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid stroke={c.line} vertical={false} />
          <XAxis dataKey="name" stroke={c.ink} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => unit + fmt(v)} stroke={c.ink} fontSize={11} tickLine={false} axisLine={false} width={56} />
          <Tooltip formatter={(v: any) => unit + fmt(Number(v))} contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {keys.map((k, i) => <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={c.series[i % c.series.length]} strokeWidth={2} strokeDasharray={k.dashed ? '5 4' : undefined} dot={{ r: 3 }} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
