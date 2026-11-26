export type Role = 'executive' | 'director' | 'ae' | 'bdr' | 'admin';
export const ROLES: Role[] = ['executive', 'director', 'ae', 'bdr', 'admin'];

export type SessionUser = {
  id: string; email: string; name: string; role: Role; lang: 'en' | 'ar';
  timezone: string; work_week: 'mon-fri' | 'sun-thu'; currency: string; theme: 'light' | 'dark';
  countries: string[]; sectors: string[]; manager_id: string | null;
};

type Perm =
  | 'cockpit' | 'brief' | 'plays.view' | 'plays.act' | 'deals.view' | 'deals.edit' | 'forecast'
  | 'targets.edit' | 'review' | 'access.view_all' | 'admin' | 'signals.add' | 'tenders' | 'sizer' | 'export';

const MATRIX: Record<Role, Perm[]> = {
  admin: ['cockpit', 'brief', 'plays.view', 'plays.act', 'deals.view', 'deals.edit', 'forecast', 'targets.edit', 'review', 'access.view_all', 'admin', 'signals.add', 'tenders', 'sizer', 'export'],
  executive: ['cockpit', 'brief', 'plays.view', 'plays.act', 'deals.view', 'forecast', 'review', 'access.view_all', 'signals.add', 'tenders', 'sizer', 'export'],
  director: ['cockpit', 'brief', 'plays.view', 'plays.act', 'deals.view', 'deals.edit', 'forecast', 'targets.edit', 'review', 'access.view_all', 'signals.add', 'tenders', 'sizer', 'export'],
  ae: ['brief', 'plays.view', 'plays.act', 'deals.view', 'deals.edit', 'signals.add', 'tenders', 'sizer', 'export'],
  bdr: ['brief', 'plays.view', 'plays.act', 'deals.view', 'deals.edit', 'signals.add', 'sizer', 'export'],
};

export const can = (u: Pick<SessionUser, 'role'>, p: Perm) => MATRIX[u.role].includes(p);

export class Forbidden extends Error { status = 403; constructor(m = 'Forbidden') { super(m); } }
export function assertCan(u: SessionUser, p: Perm) { if (!can(u, p)) throw new Forbidden(`Missing permission: ${p}`); }

/** Executives & admins see all. Directors see their territory (countries/sectors) + team. AEs/BDRs see own + territory plays. */
export const seesEverything = (u: SessionUser) => u.role === 'admin' || u.role === 'executive';
