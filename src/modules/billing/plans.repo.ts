import type { Db } from "@/platform/db";
import { DEFAULT_PLANS, type Feature, type PlanDef, type PlanLimits } from "@/platform/tenancy/plans";

interface PlanRow {
  id: string; code: string; name: string; description: string; priceMinor: number; currency: string; billingInterval: "month" | "year";
  trialDays: number; limits: PlanLimits; features: Feature[]; highlights: string[]; isPublic: boolean; isActive: boolean; sortOrder: number;
}

export const mapPlan = (r: PlanRow): PlanDef => ({
  code: r.code, name: r.name, description: r.description, priceMinor: Number(r.priceMinor), currency: r.currency,
  billingInterval: r.billingInterval, trialDays: Number(r.trialDays),
  limits: r.limits ?? { branches: 1, users: 5, terminals: 2 },
  features: r.features ?? [], highlights: r.highlights ?? [],
  isPublic: r.isPublic, isActive: r.isActive, sortOrder: Number(r.sortOrder),
});

export async function listPlans(db: Db, opts: { publicOnly?: boolean } = {}): Promise<PlanDef[]> {
  const rows = await db.col<PlanRow>("plans").find(opts.publicOnly ? { isActive: true, isPublic: true } : {}, { sort: { sortOrder: 1 } });
  return rows.map(mapPlan);
}

export async function getPlan(db: Db, code: string): Promise<PlanDef | null> {
  const row = await db.col<PlanRow>("plans").findOne({ code });
  return row ? mapPlan(row) : null;
}

export async function savePlan(db: Db, plan: PlanDef): Promise<void> {
  const now = new Date().toISOString();
  const data = {
    name: plan.name, description: plan.description, priceMinor: plan.priceMinor, currency: plan.currency,
    billingInterval: plan.billingInterval, trialDays: plan.trialDays, limits: plan.limits,
    features: plan.features, highlights: plan.highlights,
    isPublic: plan.isPublic, isActive: plan.isActive, sortOrder: plan.sortOrder, updatedAt: now,
  };
  await db.col("plans").findOneAndUpdate({ id: plan.code }, { $set: { ...data, code: plan.code }, $setOnInsert: { createdAt: now } }, { upsert: true });
}

/** Idempotent: inserts the default catalogue only for plan codes that don't exist yet. */
export async function ensureDefaultPlans(db: Db): Promise<void> {
  for (const plan of DEFAULT_PLANS) {
    const exists = await db.col("plans").findOne({ code: plan.code });
    if (!exists) await savePlan(db, plan);
  }
}
