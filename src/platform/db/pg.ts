import type { Pool, PoolClient } from "pg";
import type { Db } from "./types";
import { raw, snakeToCamel, type Sql } from "./sql";

type Queryable = Pick<Pool | PoolClient, "query">;

function camelize<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[snakeToCamel(k)] = v;
  return out as T;
}

class PgDb implements Db {
  readonly dialect = "pg" as const;
  readonly forUpdate: Sql;
  constructor(private readonly q: Queryable, private readonly pool: Pool, private readonly inTx: boolean, forUpdate: Sql) {
    this.forUpdate = forUpdate;
  }

  async all<T>(query: Sql): Promise<T[]> {
    const { text, params } = query.build();
    const res = await this.q.query(text, params);
    return res.rows.map((r: Record<string, unknown>) => camelize<T>(r));
  }
  async get<T>(query: Sql): Promise<T | null> {
    return (await this.all<T>(query))[0] ?? null;
  }
  async run(query: Sql): Promise<number> {
    const { text, params } = query.build();
    const res = await this.q.query(text, params);
    return res.rowCount ?? 0;
  }
  async exec(text: string): Promise<void> {
    await this.q.query(text);
  }
  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(new PgDb(client, this.pool, true, this.forUpdate));
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    if (!this.inTx) await this.pool.end();
  }
}

export async function createPgDb(connectionString: string, opts: { max?: number } = {}): Promise<Db> {
  const pg = await import("pg");
  const { Pool, types } = pg.default ?? pg;
  // int8 → number (our largest values — money in minor units, counters — are far below 2^53)
  types.setTypeParser(20, (v: string) => Number.parseInt(v, 10));
  // timestamptz → ISO string, so every layer sees the same representation as SQLite
  types.setTypeParser(1184, (v: string) => new Date(v).toISOString());
  // numeric (SUM/AVG of bigint) → number
  types.setTypeParser(1700, (v: string) => Number(v));
  const pool: Pool = new Pool({ connectionString, max: opts.max ?? 10, idleTimeoutMillis: 30_000 });
  return new PgDb(pool, pool, false, raw(" FOR UPDATE"));
}
