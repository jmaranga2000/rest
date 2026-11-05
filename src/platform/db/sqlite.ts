import type { Db } from "./types";
import { raw, snakeToCamel, type Sql, type Value } from "./sql";

/**
 * SQLite adapter on Node's built-in `node:sqlite` (Node ≥ 22.5).
 * Intended for zero-install local development and the automated test-suite.
 * Production runs on PostgreSQL. The SQL in this codebase is written in the
 * subset both engines share, so the same repositories run unchanged.
 */
type StatementSync = { all(...p: unknown[]): unknown[]; run(...p: unknown[]): { changes: number | bigint } };
type DatabaseSync = { prepare(sql: string): StatementSync; exec(sql: string): void; close(): void };

/** Boolean columns: the is_/has_ convention plus the few legacy-named ones (kept in sync with the migration). */
const BOOL_KEY = /^(is_|has_|all_branches$|allow_negative_stock$|cancel_at_period_end$|loyalty_enabled$|must_change_password$|require_shift_for_cash$|service_charge_taxable$|tax_inclusive$)/;

function convertRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    let val: unknown = typeof v === "bigint" ? Number(v) : v;
    if (BOOL_KEY.test(k) && (val === 0 || val === 1)) val = val === 1;
    out[snakeToCamel(k)] = val;
  }
  return out as T;
}

function toParam(v: Value): string | number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

class SqliteDb implements Db {
  readonly dialect = "sqlite" as const;
  readonly forUpdate = raw("");
  constructor(
    private readonly handle: DatabaseSync,
    private readonly gate: { tail: Promise<unknown> } = { tail: Promise.resolve() },
    private readonly inTx = false,
  ) {}

  private prepare(query: Sql) {
    const { text, params } = query.build();
    // Postgres-style $1 placeholders → SQLite numbered parameters ?1
    const sqliteText = text.replace(/\$(\d+)/g, "?$1");
    return { stmt: this.handle.prepare(sqliteText), params: params.map(toParam) };
  }

  async all<T>(query: Sql): Promise<T[]> {
    const { stmt, params } = this.prepare(query);
    return stmt.all(...params).map((r) => convertRow<T>(r as Record<string, unknown>));
  }
  async get<T>(query: Sql): Promise<T | null> {
    return (await this.all<T>(query))[0] ?? null;
  }
  async run(query: Sql): Promise<number> {
    const { stmt, params } = this.prepare(query);
    return Number(stmt.run(...params).changes);
  }
  async exec(text: string): Promise<void> {
    this.handle.exec(text);
  }
  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    // One connection, so top-level transactions are serialised (like a single writer).
    const run = async (): Promise<T> => {
      this.handle.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn(new SqliteDb(this.handle, this.gate, true));
        this.handle.exec("COMMIT");
        return result;
      } catch (err) {
        try { this.handle.exec("ROLLBACK"); } catch { /* connection already closed */ }
        throw err;
      }
    };
    const next = this.gate.tail.then(run, run);
    this.gate.tail = next.catch(() => undefined);
    return next;
  }
  async close(): Promise<void> {
    this.handle.close();
  }
}

export async function createSqliteDb(path: string): Promise<Db> {
  const specifier = "node:sqlite";
  const mod = (await import(/* webpackIgnore: true */ specifier)) as { DatabaseSync: new (p: string) => DatabaseSync };
  if (path !== ":memory:") {
    const { mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(path), { recursive: true });
  }
  const handle = new mod.DatabaseSync(path);
  handle.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  return new SqliteDb(handle);
}
