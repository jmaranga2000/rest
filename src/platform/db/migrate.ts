import { readdirSync, readFileSync } from "node:fs";
import { join as pathJoin } from "node:path";
import type { Db } from "./types";
import { sql } from "./sql";

/**
 * Portable-SQL migrations. Files live in db/migrations/NNNN_name.sql and are
 * written in the Postgres/SQLite common subset; the only dialect switches are
 * the `{{AUTOINC_PK}}` token and TIMESTAMPTZ (text on SQLite).
 */
export function renderMigration(text: string, dialect: Db["dialect"]): string {
  if (dialect === "pg") return text.replaceAll("{{AUTOINC_PK}}", "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY");
  return text
    .replaceAll("{{AUTOINC_PK}}", "INTEGER PRIMARY KEY AUTOINCREMENT")
    .replace(/\bTIMESTAMPTZ\b/g, "TEXT")
    .replace(/\bBIGINT\b/g, "INTEGER");
}

export async function migrate(db: Db, dir = pathJoin(process.cwd(), "db", "migrations")): Promise<string[]> {
  await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set((await db.all<{ id: string }>(sql`SELECT id FROM schema_migrations`)).map((r) => r.id));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const text = renderMigration(readFileSync(pathJoin(dir, file), "utf8"), db.dialect);
    if (db.dialect === "pg") {
      await db.tx(async (tx) => {
        await tx.exec(text);
        await tx.run(sql`INSERT INTO schema_migrations (id, applied_at) VALUES (${file}, ${new Date().toISOString()})`);
      });
    } else {
      await db.exec("BEGIN");
      try {
        await db.exec(text);
        await db.run(sql`INSERT INTO schema_migrations (id, applied_at) VALUES (${file}, ${new Date().toISOString()})`);
        await db.exec("COMMIT");
      } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
      }
    }
    ran.push(file);
  }
  return ran;
}
