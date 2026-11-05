import type { Db } from "./types";
import { camelToSnake, ident, join, raw, sql, type Sql, type Value } from "./sql";

type Data = Record<string, Value>;

function entries(data: Data): [string, Value][] {
  return Object.entries(data).filter(([, v]) => v !== undefined);
}

/** INSERT with camelCase keys mapped to snake_case columns. `undefined` values are skipped. */
export async function insert(db: Db, table: string, data: Data): Promise<void> {
  const es = entries(data);
  const cols = es.map(([k]) => raw(ident(camelToSnake(k))));
  const vals = es.map(([, v]) => sql`${v}`);
  await db.run(sql`INSERT INTO ${raw(ident(table))} (${join(cols)}) VALUES (${join(vals)})`);
}

/** UPDATE ... SET with camelCase keys. `where` is a required fragment (without the WHERE keyword). */
export async function update(db: Db, table: string, data: Data, whereCond: Sql): Promise<number> {
  const es = entries(data);
  if (es.length === 0) return 0;
  const sets = es.map(([k, v]) => sql`${raw(ident(camelToSnake(k)))} = ${v}`);
  return db.run(sql`UPDATE ${raw(ident(table))} SET ${join(sets)} WHERE ${whereCond}`);
}

/** Multi-row INSERT in chunks (keeps parameter counts safely below driver limits). */
export async function insertMany(db: Db, table: string, rows: Data[], chunkSize = 100): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const first = chunk[0];
    if (!first) continue;
    const keys = entries(first).map(([k]) => k);
    const cols = keys.map((k) => raw(ident(camelToSnake(k))));
    const tuples = chunk.map((row) => sql`(${join(keys.map((k) => sql`${row[k] ?? null}`))})`);
    await db.run(sql`INSERT INTO ${raw(ident(table))} (${join(cols)}) VALUES ${join(tuples)}`);
  }
}

/** Atomic per-scope counter (order numbers, PO numbers). Works on Postgres and SQLite. */
export async function nextCounter(db: Db, orgId: string, branchId: string | null, scope: string): Promise<number> {
  const row = await db.get<{ value: number }>(sql`
    INSERT INTO counters (org_id, branch_id, scope, value) VALUES (${orgId}, ${branchId ?? ""}, ${scope}, 1)
    ON CONFLICT (org_id, branch_id, scope) DO UPDATE SET value = counters.value + 1
    RETURNING value`);
  if (!row) throw new Error("Counter update returned no row");
  return Number(row.value);
}

export const parseJson = <T>(text: string | null | undefined, fallback: T): T => {
  if (!text) return fallback;
  try { return JSON.parse(text) as T; } catch { return fallback; }
};
