import postgres from 'postgres';

const g = globalThis as unknown as { __sql?: postgres.Sql };
export const sql: postgres.Sql =
  g.__sql ??
  postgres(process.env.DATABASE_URL ?? 'postgres://meridian:meridian@localhost:5432/meridian', {
    max: 10,
    idle_timeout: 30,
    onnotice: () => {},
    transform: { undefined: null },
  });
if (process.env.NODE_ENV !== 'production') g.__sql = sql;

export type Row = Record<string, any>;
