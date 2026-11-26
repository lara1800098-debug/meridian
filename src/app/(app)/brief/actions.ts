'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { assertCan } from '@/lib/rbac';
import { generateBriefFor } from '@/lib/brief';
import { audit } from '@/lib/audit';
export async function generateNow() {
  const u = await requireUser();
  assertCan(u, 'brief');
  const id = await generateBriefFor(u, true);
  await audit(u.id, 'brief.generate', 'brief', id);
  redirect(`/brief/${id}`);
}
