import { env } from "./env";
import { createMemoryDb } from "./store/memory";
import type { Db, Doc, Filter, HasId } from "./store/types";
import { newId } from "./ids";

export type { Db, Doc, Filter, Collection, UpdateSpec, FindOpts } from "./store/types";
export { DuplicateKeyError } from "./store/types";
export { createMemoryDb } from "./store/memory";

declare global {
  // eslint-disable-next-line no-var
  var __rosDb: Promise<Db> | undefined;
}

/** Process-wide database handle (cached across hot reloads / warm serverless invocations). */
export function getDb(): Promise<Db> {
  if (!globalThis.__rosDb) {
    globalThis.__rosDb = (async () => {
      const e = env();
      if (e.MONGODB_URI === "memory") return createMemoryDb();
      const { createMongoDb } = await import("./store/mongo");
      return createMongoDb(e.MONGODB_URI, e.MONGODB_DB);
    })();
  }
  return globalThis.__rosDb;
}

/** Atomic per-scope counter (order numbers, PO numbers, event sequence). */
export async function nextCounter(db: Db, orgId: string, branchId: string | null, scope: string): Promise<number> {
  const id = `${orgId}:${branchId ?? ""}:${scope}`;
  const row = await db.col<Doc & { value: number }>("counters").findOneAndUpdate({ id }, { $inc: { value: 1 }, $setOnInsert: { orgId, branchId: branchId ?? "", scope } }, { upsert: true });
  if (!row) throw new Error("Counter update returned no row");
  return Number(row.value);
}

/** Load several documents of one tenant by id, as a Map (the replacement for SQL JOINs on id). */
export async function byIds<T extends HasId>(db: Db, collection: string, orgId: string | null, ids: Iterable<string | null | undefined>): Promise<Map<string, T>> {
  const wanted = [...new Set([...ids].filter((x): x is string => typeof x === "string"))];
  if (!wanted.length) return new Map();
  const filter: Filter = { id: { $in: wanted }, ...(orgId ? { orgId } : {}) };
  return new Map((await db.col<T>(collection).find(filter)).map((d) => [d.id, d]));
}

export const nowIso = (): string => new Date().toISOString();
export { newId };
