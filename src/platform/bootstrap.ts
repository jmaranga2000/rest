import type { Db } from "./db";
import { ensureDefaultPlans } from "@/modules/billing/plans.repo";
import { syncSystemRoles } from "@/modules/identity/roles.repo";

/**
 * Idempotent "migration" for a document database: create/refresh indexes, make sure the default
 * plans exist and bring every organisation's built-in roles in line with the permission sets in code.
 * Run on every deploy (`npm run db:migrate`) — safe to repeat.
 */
export async function prepareDatabase(db: Db): Promise<{ orgs: number; roleChanges: number }> {
  await db.ensureIndexes();
  await ensureDefaultPlans(db);
  const orgs = await db.col("organizations").find({});
  let roleChanges = 0;
  for (const o of orgs) { const r = await syncSystemRoles(db, o.id); roleChanges += r.created + r.updated; }
  return { orgs: orgs.length, roleChanges };
}
