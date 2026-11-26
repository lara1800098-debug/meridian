import { sql } from '@/db';
import { DEFAULT_SETTINGS } from '@/db/defaults';

export type Weights = { fit: number; intent: number; timing: number; access: number };
export type Settings = {
  weights: Record<'enterprise' | 'smb' | 'competitor', Weights>;
  tiers: { leader: number; team: number };
  playThreshold: number;
  models: Record<string, string>;
  aiDailyBudgetUsd: number;
  aiEnabled: boolean;
  staleDays: number;
  coverageThreshold: number;
  realistic: { atRiskFactor: number; watchFactor: number };
  closeDatePushLimit: number;
  valueChangePct: number;
  lowActivityPeriods: { name: string; from: string; to: string }[];
  crawler: { perDomainDelayMs: number; timeoutMs: number; maxItemsPerRun: number };
  pilotCountries: string[];
};

export async function getSettings(): Promise<Settings> {
  const rows = await sql`SELECT key, value FROM settings`;
  const out: any = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

export async function setSetting(key: keyof Settings, value: unknown) {
  await sql`INSERT INTO settings (key, value) VALUES (${key}, ${sql.json(value as any)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}
