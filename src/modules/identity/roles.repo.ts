import type { Db } from "@/platform/db";
import { newId } from "@/platform/ids";
import { SYSTEM_ROLES } from "@/platform/rbac/roles";

/**
 * Creates any missing built-in roles and brings existing built-in roles in line
 * with the permission sets defined in code. Run on provisioning and on deploy
 * (`npm run db:migrate` calls it for every organisation) — never per request.
 * Custom roles are never touched. Permissions are embedded in the role document.
 */
export async function syncSystemRoles(db: Db, orgId: string): Promise<{ created: number; updated: number }> {
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  const roles = db.col<{ id: string; permissions: string[]; [k: string]: unknown }>("roles");
  for (const def of SYSTEM_ROLES) {
    const existing = await roles.findOne({ orgId, key: def.key });
    const permissions = [...def.permissions].sort();
    if (!existing) {
      await roles.insert({ id: newId("role"), orgId, key: def.key, name: def.name, description: def.description, isSystem: true, allBranches: def.allBranches, permissions, createdAt: now, updatedAt: now });
      created += 1;
    } else {
      const same = JSON.stringify([...existing.permissions].sort()) === JSON.stringify(permissions);
      await roles.update({ id: existing.id }, { $set: { name: def.name, description: def.description, isSystem: true, allBranches: def.allBranches, permissions, updatedAt: now } });
      if (!same) updated += 1;
    }
  }
  return { created, updated };
}
