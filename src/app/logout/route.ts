import { NextResponse } from 'next/server';
import { destroySession, readSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
export async function POST(req: Request) {
  const s = await readSession();
  if (s) await audit(s.user.id, 'logout');
  await destroySession();
  return NextResponse.redirect(new URL('/login', req.url), 303);
}
