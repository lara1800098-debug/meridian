import { cookies } from 'next/headers';
import { COOKIE, readSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { renderPdf } from '@/lib/pdf';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export async function GET(req: Request) {
  const s = await readSession();
  if (!s?.mfa_passed || !can(s.user, 'export')) return new Response('Forbidden', { status: 403 });
  const p = new URL(req.url).searchParams.get('p') ?? '';
  if (!/^\/print\/[a-z-]+(\/[0-9a-f-]{36})?(\?[\w=&%-]*)?$/.test(p)) return new Response('Bad path', { status: 400 });
  const raw = (await cookies()).get(COOKIE)!.value;
  try {
    const pdf = await renderPdf(p, { name: COOKIE, value: raw });
    await audit(s.user.id, 'export.pdf', 'pdf', p);
    const name = `meridian-${p.split('/')[2]}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"` } });
  } catch (e: any) {
    return new Response(`PDF rendering failed: ${e?.message ?? e}`, { status: 500 });
  }
}
