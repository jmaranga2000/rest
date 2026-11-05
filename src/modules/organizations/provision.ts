import type { Db } from "@/platform/db";
import { hashSecret } from "@/platform/auth/password";
import { newId, newSecret } from "@/platform/ids";
import { ConflictError, ValidationError } from "@/platform/errors";
import { DEFAULT_TRIAL_PLAN } from "@/platform/tenancy/plans";
import { ensureDefaultPlans, getPlan } from "@/modules/billing/plans.repo";
import { syncSystemRoles } from "@/modules/identity/roles.repo";

export interface ProvisionInput {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  currency?: string;
  timezone?: string;
  country?: string;
  firstBranchName?: string;
  planCode?: string;
  now?: Date;
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "restaurant";
}

async function uniqueSlug(db: Db, base: string): Promise<string> {
  let slug = base;
  for (let i = 2; i < 50; i += 1) {
    const taken = await db.col("organizations").findOne({ slug });
    if (!taken) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${newSecret(3).toLowerCase()}`;
}

/**
 * Creates a complete, usable tenant in one transaction:
 * organisation, settings, trial subscription, first branch, built-in roles and the owner.
 */
export async function provisionOrganization(db: Db, input: ProvisionInput): Promise<{ orgId: string; ownerId: string; branchId: string }> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const email = input.ownerEmail.trim().toLowerCase();

  return db.tx(async (tx) => {
    await ensureDefaultPlans(tx);
    const existing = await tx.col("users").findOne({ emailLower: email });
    if (existing) throw new ConflictError("An account with that email already exists. Sign in instead.");

    const planCode = input.planCode ?? DEFAULT_TRIAL_PLAN;
    const plan = await getPlan(tx, planCode);
    if (!plan) throw new ValidationError(`Unknown plan "${planCode}".`);

    const orgId = newId("org");
    const branchId = newId("branch");
    const ownerId = newId("user");
    const slug = await uniqueSlug(tx, slugify(input.businessName));

    await tx.col("organizations").insert({
      id: orgId, slug, name: input.businessName.trim(), email,
      country: input.country ?? "KE", currency: input.currency ?? "KES", timezone: input.timezone ?? "Africa/Nairobi",
      createdAt: nowIso, updatedAt: nowIso,
    });
    await tx.col("orgSettings").insert({ id: orgId, orgId, updatedAt: nowIso });
    await tx.col("subscriptions").insert({
      id: orgId, orgId, planCode, status: "trialing",
      trialEndsAt: new Date(now.getTime() + plan.trialDays * 86_400_000).toISOString(),
      createdAt: nowIso, updatedAt: nowIso,
    });
    await tx.col("branches").insert({
      id: branchId, orgId, code: "MAIN", name: input.firstBranchName?.trim() || "Main branch",
      displayKey: newSecret(18), createdAt: nowIso, updatedAt: nowIso,
    });
    await syncSystemRoles(tx, orgId);
    const owner = await tx.col("roles").findOne({ orgId, key: "owner" });
    await tx.col("users").insert({
      id: ownerId, orgId, roleId: owner!.id, name: input.ownerName.trim(), email, emailLower: email, branchIds: [branchId],
      passwordHash: await hashSecret(input.ownerPassword), createdAt: nowIso, updatedAt: nowIso,
    });
    await tx.col("stations").insert({ id: newId("station"), orgId, name: "Kitchen", sortOrder: 1, createdAt: nowIso });
    return { orgId, ownerId, branchId };
  });
}
