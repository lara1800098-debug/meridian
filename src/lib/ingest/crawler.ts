/**
 * Polite web reader: robots.txt respected, per-domain rate limit, clear user agent, timeouts, caching.
 * Only public pages. Never logs in, never bypasses access controls or paywalls.
 */
import { XMLParser } from 'fast-xml-parser';
import { fetch as ufetch } from 'undici';
import { useEnvProxy } from '../proxy';
useEnvProxy();
const fetch = ufetch as unknown as typeof globalThis.fetch;

export const USER_AGENT = `MeridianBot/1.0 (internal CX market research; respects robots.txt; contact: ${process.env.CRAWLER_CONTACT || 'meridian-crawler'})`;
const robotsCache = new Map<string, { at: number; rules: { allow: string[]; disallow: string[] } | null }>();
const lastHit = new Map<string, number>();

async function politeWait(host: string, delayMs: number) {
  const last = lastHit.get(host) ?? 0;
  const wait = last + delayMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

export function parseRobots(txt: string, ua = 'meridianbot') {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === 'allow' && v) cur.allow.push(v);
    if (k === 'disallow' && v) cur.disallow.push(v);
  }
  const g = groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a))) ?? groups.find((g) => g.agents.includes('*'));
  return g ? { allow: g.allow, disallow: g.disallow } : { allow: [], disallow: [] };
}

export function robotsAllows(rules: { allow: string[]; disallow: string[] } | null, pathAndQuery: string) {
  if (!rules) return true;
  const match = (p: string) => {
    const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    return re.test(pathAndQuery);
  };
  const a = rules.allow.filter(match).sort((x, y) => y.length - x.length)[0];
  const d = rules.disallow.filter(match).sort((x, y) => y.length - x.length)[0];
  if (!d) return true;
  return !!a && a.length >= d.length;
}

async function robotsFor(u: URL, timeoutMs: number) {
  const c = robotsCache.get(u.host);
  if (c && Date.now() - c.at < 6 * 3600_000) return c.rules;
  let rules: { allow: string[]; disallow: string[] } | null = null;
  try {
    const r = await fetch(`${u.protocol}//${u.host}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
    if (r.ok) rules = parseRobots(await r.text());
    else if (r.status === 401 || r.status === 403) rules = { allow: [], disallow: ['/'] }; // treat as full disallow
  } catch { rules = null; }
  robotsCache.set(u.host, { at: Date.now(), rules });
  return rules;
}

export class RobotsDenied extends Error {}

export async function politeFetch(url: string, opts: { delayMs?: number; timeoutMs?: number } = {}) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || u.hostname.endsWith('.internal')) throw new Error('Private addresses are not allowed');
  const timeoutMs = opts.timeoutMs ?? 20000;
  const rules = await robotsFor(u, timeoutMs);
  if (!robotsAllows(rules, u.pathname + u.search)) throw new RobotsDenied(`robots.txt disallows ${u.pathname}`);
  await politeWait(u.host, opts.delayMs ?? 4000);
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml,application/rss+xml,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const len = Number(r.headers.get('content-length') ?? 0);
  if (len > 8_000_000) throw new Error('Response too large');
  return { text: await r.text(), finalUrl: r.url, contentType: r.headers.get('content-type') ?? '' };
}

export const stripHtml = (s: string) => s
  .replace(/<(script|style|noscript|svg|nav|footer|header|form|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>|<\/p>|<\/h\d>|<\/li>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

export type FeedItem = { url: string; title: string; excerpt: string; publishedAt: Date | null; outlet: string | null };

export function parseFeed(xml: string): FeedItem[] {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', processEntities: true, maxNestedTags: 400 } as any);
  const doc = p.parse(xml);
  const txt = (v: any): string => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : v['#text'] ?? '');
  const items: any[] = doc?.rss?.channel?.item ? [].concat(doc.rss.channel.item) : doc?.feed?.entry ? [].concat(doc.feed.entry) : doc?.['rdf:RDF']?.item ? [].concat(doc['rdf:RDF'].item) : [];
  return items.map((it) => {
    const link = typeof it.link === 'string' ? it.link : Array.isArray(it.link) ? (it.link.find((l: any) => l['@rel'] !== 'self')?.['@href'] ?? '') : it.link?.['@href'] ?? txt(it.link);
    let title = stripHtml(txt(it.title));
    let outlet: string | null = txt(it.source) || null;
    // Google News style "Headline - Outlet"
    const gm = /^(.*)\s[-–]\s([^-–]{2,60})$/.exec(title);
    if (gm && (outlet || link.includes('news.google.com'))) { title = gm[1]; outlet = outlet ?? gm[2]; }
    const d = txt(it.pubDate) || txt(it.published) || txt(it.updated) || txt(it['dc:date']);
    const excerpt = stripHtml(txt(it.description) || txt(it.summary) || txt(it['content:encoded'])).slice(0, 600);
    return { url: String(link).trim(), title: title.trim(), excerpt: excerpt === title ? '' : excerpt, publishedAt: d ? new Date(d) : null, outlet };
  }).filter((i) => i.url && i.title);
}

export function parseHtmlPage(html: string, url: string) {
  const meta = (n: string) => new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']+)`, 'i').exec(html)?.[1] ?? new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${n}["']`, 'i').exec(html)?.[1];
  const title = stripHtml(meta('og:title') ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? url).slice(0, 300);
  const desc = stripHtml(meta('og:description') ?? meta('description') ?? '');
  const mainHtml = /<article[\s\S]*?<\/article>/i.exec(html)?.[0] ?? /<main[\s\S]*?<\/main>/i.exec(html)?.[0] ?? html;
  const body = stripHtml(mainHtml).slice(0, 30000);
  const pub = meta('article:published_time') ?? meta('og:published_time') ?? /"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  return { title, excerpt: (desc || body.slice(0, 400)).slice(0, 600), body, publishedAt: pub ? new Date(pub) : null };
}
