import { env } from "../env";
import type { Db } from "./types";

export type { Db } from "./types";
export { sql, list, raw, join, where, empty } from "./sql";
export type { Sql } from "./sql";
export { insert, update, insertMany, nextCounter, parseJson } from "./helpers";

declare global {
  // eslint-disable-next-line no-var
  var __rosDb: Promise<Db> | undefined;
}

/** Process-wide database handle (cached across hot reloads / warm serverless invocations). */
export function getDb(): Promise<Db> {
  if (!globalThis.__rosDb) {
    globalThis.__rosDb = (async () => {
      const url = env().DATABASE_URL;
      if (url.startsWith("sqlite:")) {
        const { createSqliteDb } = await import("./sqlite");
        return createSqliteDb(url.slice("sqlite:".length));
      }
      const { createPgDb } = await import("./pg");
      return createPgDb(url);
    })();
  }
  return globalThis.__rosDb;
}
