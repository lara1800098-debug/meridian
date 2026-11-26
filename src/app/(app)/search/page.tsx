import Link from 'next/link';
import { pageCtx } from '@/lib/ctx';
import Shell from '@/components/Shell';
import { Card, PageHeader } from '@/components/ui';
import { sql } from '@/db';
import { dealScope, playScope } from '@/lib/data/deals';

/** Typo-tolerant AR/EN search via pg_trgm similarity + substring. Results respect RBAC scopes. */
export default async function Search({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await pageCtx();
  const { t, user } = ctx;
  const q = ((await searchParams).q ?? '').trim().slice(0, 100);
  const like = `%${q}%`;
  const [orgs, signals, plays, deals] = q ? await Promise.all([
    sql`SELECT id, name_en, name_ar FROM organisations WHERE name_en ILIKE ${like} OR name_ar ILIKE ${like} OR ${q} ILIKE ANY(aliases) OR similarity(name_en, ${q}) > 0.25 OR word_similarity(${q}, name_en) > 0.5 ORDER BY greatest(similarity(name_en, ${q}), word_similarity(${q}, name_en)) DESC LIMIT 10`,
    sql`SELECT id, title FROM signals WHERE title ILIKE ${like} OR title_en ILIKE ${like} OR summary ILIKE ${like} OR word_similarity(${q}, title) > 0.5 ORDER BY word_similarity(${q}, title) DESC LIMIT 10`,
    sql`SELECT p.id, p.headline FROM plays p JOIN signals s ON s.id = p.signal_id WHERE ${playScope(user)} AND (p.headline ILIKE ${like} OR p.headline_ar ILIKE ${like} OR word_similarity(${q}, p.headline) > 0.5) LIMIT 10`,
    sql`SELECT d.id, d.title FROM deals d WHERE ${dealScope(user)} AND (d.title ILIKE ${like} OR word_similarity(${q}, d.title) > 0.5 OR d.notes ILIKE ${like}) LIMIT 10`,
  ]) : [[], [], [], []];
  const block = (title: string, rows: any[], href: (r: any) => string, label: (r: any) => string) => (
    <Card title={`${title} (${rows.length})`}><ul className="space-y-1 text-sm">{rows.map((r) => <li key={r.id}><Link className="hover:underline" href={href(r)} dir="auto">{label(r)}</Link></li>)}</ul></Card>
  );
  return (
    <Shell ctx={ctx} active="search">
      <PageHeader title={t('nav.search')} />
      <form className="mb-4 max-w-xl"><input name="q" defaultValue={q} autoFocus className="input" placeholder="Search Arabic or English — typos are fine" /></form>
      {q && <div className="grid gap-4 md:grid-cols-2">
        {block(t('nav.orgs'), orgs, (r) => `/orgs/${r.id}`, (r) => r.name_ar ? `${r.name_en} · ${r.name_ar}` : r.name_en)}
        {block(t('nav.plays'), plays, (r) => `/plays/${r.id}`, (r) => r.headline)}
        {block(t('nav.deals'), deals, (r) => `/deals/${r.id}`, (r) => r.title)}
        {block(t('nav.signals'), signals, (r) => `/signals/${r.id}`, (r) => r.title)}
      </div>}
    </Shell>
  );
}
