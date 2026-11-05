import type { Db, Doc } from "@/platform/db";
import { newId } from "@/platform/ids";
import { NotFoundError } from "@/platform/errors";
import { getPlan } from "./plans.repo";

/**
 * Extends an organisation's subscription by one billing period and reactivates it.
 * The single place that turns "money received" into "subscription active", shared by the
 * operator's manual payment form and the automatic Paystack settlement.
 */
export async function applySubscriptionPayment(db: Db, i: { orgId: string; planCode?: string | null; amountMinor: number; method: string; reference?: string | null; recordedBy: string | null; now?: Date }): Promise<{ planName: string; planCode: string; periodEnd: string }> {
  const s = await db.col<Doc & { planCode: string; currentPeriodEnd: string | null }>("subscriptions").findOne({ orgId: i.orgId });
  if (!s) throw new NotFoundError("Organisation");
  const plan = await getPlan(db, i.planCode || s.planCode);
  if (!plan) throw new NotFoundError("Plan");
  const now = i.now ?? new Date();
  const start = new Date(Math.max(now.getTime(), s.currentPeriodEnd ? Date.parse(s.currentPeriodEnd) : 0));
  const end = new Date(start);
  if (plan.billingInterval === "year") end.setUTCFullYear(end.getUTCFullYear() + 1); else end.setUTCMonth(end.getUTCMonth() + 1);
  await db.col("billingPayments").insert({ id: newId("billing"), orgId: i.orgId, amountMinor: i.amountMinor, currency: plan.currency, method: i.method, reference: i.reference ?? null, planCode: plan.code, periodStart: start.toISOString(), periodEnd: end.toISOString(), recordedBy: i.recordedBy, createdAt: now.toISOString() });
  await db.col("subscriptions").update({ orgId: i.orgId }, { $set: { planCode: plan.code, status: "active", currentPeriodStart: start.toISOString(), currentPeriodEnd: end.toISOString(), trialEndsAt: null, updatedAt: now.toISOString() } });
  await db.col("organizations").update({ id: i.orgId, status: "suspended" }, { $set: { status: "active", suspendedReason: null } });
  return { planName: plan.name, planCode: plan.code, periodEnd: end.toISOString() };
}
