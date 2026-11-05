import type { Sql, Value } from "./sql";

export type Dialect = "pg" | "sqlite";

/**
 * The only database surface the application depends on.
 * - Rows come back with camelCase keys (`org_id` → `orgId`).
 * - Columns named `is_*` / `has_*` are returned as booleans on every dialect.
 * - Timestamps are ISO-8601 strings; money/quantities are integers.
 */
export interface Db {
  readonly dialect: Dialect;
  all<T = Record<string, unknown>>(query: Sql): Promise<T[]>;
  get<T = Record<string, unknown>>(query: Sql): Promise<T | null>;
  /** Run a write; returns the number of affected rows. */
  run(query: Sql): Promise<number>;
  /** Run multi-statement SQL with no parameters (migrations). */
  exec(text: string): Promise<void>;
  /**
   * Run `fn` in a transaction. On a handle that is already transactional the
   * callback joins the outer transaction (flat nesting).
   */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  /** Appended to SELECTs that must lock the rows they read (`FOR UPDATE`; empty on SQLite). */
  readonly forUpdate: Sql;
  close(): Promise<void>;
}

export type Row = Record<string, Value>;
