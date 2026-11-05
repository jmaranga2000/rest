import type { Ctx } from "@/platform/auth/context";
import type { Doc } from "@/platform/db";
import { customerSearchFilter } from "./service";
import { newId } from "@/platform/ids";
import { BusinessRuleError, NotFoundError } from "@/platform/errors";
import { bpOf, currencyFractionDigits } from "@/platform/money";

/**
 * Loyalty engine. Called by the orders module inside the order's transaction.
 * Sign convention in loyalty_ledger.points: earn +, redeem −, reverse = the opposite
 * of what it undoes. Every function is idempotent per order.
 */
interface Cust { id: string; pointsBalance: number }
type CustDoc = Doc & { pointsBalance: number; name: string; phone: string | null };

async function requireCustomer(ctx: Ctx, customerId: string): Promise<Cust> {
  const c = await ctx.db.col<CustDoc>("customers").findOne({ orgId: ctx.org.id, id: customerId });
  if (!c) throw new NotFoundError("Customer");
  return { id: c.id, pointsBalance: Number(c.pointsBalance) };
}

async function balanceOf(ctx: Ctx, customerId: string): Promise<number> {
  const r = await ctx.db.col<CustDoc>("customers").findOne({ orgId: ctx.org.id, id: customerId });
  return Number(r?.pointsBalance ?? 0);
}

/** Points earned for an order total, using integer math. */
export function pointsForTotal(totalMinor: number, pointsPer100: number, currency: string): number {
  if (totalMinor <= 0 || pointsPer100 <= 0) return 0;
  return Math.floor((totalMinor * pointsPer100) / (100 * 10 ** currencyFractionDigits(currency)));
}

export async function onOrderPaid(ctx: Ctx, input: { orderId: string; customerId: string; totalMinor: number }): Promise<{ pointsEarned: number }> {
  await requireCustomer(ctx, input.customerId);
  const done = await ctx.db.col("loyaltyLedger").findOne({ orgId: ctx.org.id, orderId: input.orderId, type: "earn" });
  if (done) return { pointsEarned: 0 };

  const points = ctx.settings.loyaltyEnabled ? pointsForTotal(input.totalMinor, ctx.settings.loyaltyEarnPointsPer100, ctx.org.currency) : 0;
  const now = new Date().toISOString();
  await ctx.db.col("customers").update({ orgId: ctx.org.id, id: input.customerId }, { $inc: { visits: 1, lifetimeSpendMinor: input.totalMinor, pointsBalance: points }, $set: { lastVisitAt: now, updatedAt: now } });
  // A zero-point row is still written: it makes the visit idempotent and reversible.
  await ctx.db.col("loyaltyLedger").insert({
    id: newId("loyalty"), orgId: ctx.org.id, customerId: input.customerId, orderId: input.orderId, type: "earn", points,
    balanceAfter: await balanceOf(ctx, input.customerId), note: points ? "Points earned on order" : "Visit", createdBy: ctx.userId, createdAt: now,
  });
  return { pointsEarned: points };
}

interface RewardRow { id: string; name: string; pointsCost: number; kind: "amount_off" | "percent_off"; value: number }

async function loadReward(ctx: Ctx, rewardId: string): Promise<RewardRow> {
  const r = await ctx.db.col<Doc & Omit<RewardRow, "id">>("loyaltyRewards").findOne({ orgId: ctx.org.id, id: rewardId, isActive: true });
  if (!r) throw new NotFoundError("Reward");
  return { id: r.id, name: r.name, kind: r.kind, pointsCost: Number(r.pointsCost), value: Number(r.value) };
}

export function rewardDiscount(reward: Pick<RewardRow, "kind" | "value">, subtotalMinor: number): number {
  const raw = reward.kind === "amount_off" ? reward.value : bpOf(subtotalMinor, reward.value);
  return Math.max(0, Math.min(raw, subtotalMinor));
}

export async function previewReward(ctx: Ctx, input: { customerId: string; rewardId: string; subtotalMinor: number }): Promise<{ pointsCost: number; discountMinor: number; rewardName: string }> {
  const customer = await requireCustomer(ctx, input.customerId);
  const reward = await loadReward(ctx, input.rewardId);
  if (customer.pointsBalance < reward.pointsCost) throw new BusinessRuleError(`Not enough points: needs ${reward.pointsCost}, has ${customer.pointsBalance}.`);
  return { pointsCost: reward.pointsCost, discountMinor: rewardDiscount(reward, input.subtotalMinor), rewardName: reward.name };
}

export async function redeemReward(ctx: Ctx, input: { orderId: string; customerId: string; rewardId: string; subtotalMinor: number }): Promise<{ pointsCost: number; discountMinor: number }> {
  await requireCustomer(ctx, input.customerId);
  const reward = await loadReward(ctx, input.rewardId);
  const discountMinor = rewardDiscount(reward, input.subtotalMinor);
  const existing = await ctx.db.col<Doc & { points: number }>("loyaltyLedger").findOne({ orgId: ctx.org.id, orderId: input.orderId, type: "redeem" });
  if (existing) return { pointsCost: -Number(existing.points), discountMinor };

  const changed = await ctx.db.col("customers").update({ orgId: ctx.org.id, id: input.customerId, pointsBalance: { $gte: reward.pointsCost } }, { $inc: { pointsBalance: -reward.pointsCost }, $set: { updatedAt: new Date().toISOString() } });
  if (!changed) throw new BusinessRuleError("Not enough loyalty points for this reward.");
  await ctx.db.col("loyaltyLedger").insert({
    id: newId("loyalty"), orgId: ctx.org.id, customerId: input.customerId, orderId: input.orderId, type: "redeem", points: -reward.pointsCost,
    balanceAfter: await balanceOf(ctx, input.customerId), note: `Redeemed: ${reward.name}`, createdBy: ctx.userId, createdAt: new Date().toISOString(),
  });
  return { pointsCost: reward.pointsCost, discountMinor };
}

export async function reverseLoyaltyForOrder(ctx: Ctx, orderId: string): Promise<void> {
  const ledger = ctx.db.col<Doc & { customerId: string; type: "earn" | "redeem"; points: number }>("loyaltyLedger");
  const done = await ledger.findOne({ orgId: ctx.org.id, orderId, type: "reverse" });
  if (done) return;
  const entries = await ledger.find({ orgId: ctx.org.id, orderId, type: { $in: ["earn", "redeem"] } }, { sort: { createdAt: 1 } });
  if (!entries.length) return;
  const order = await ctx.db.col<Doc & { totalMinor: number }>("orders").findOne({ orgId: ctx.org.id, id: orderId });
  const now = new Date().toISOString();
  const customers = ctx.db.col<CustDoc & { visits: number; lifetimeSpendMinor: number }>("customers");
  for (const e of entries) {
    const delta = -Number(e.points);
    const isEarn = e.type === "earn";
    const spend = isEarn ? Number(order?.totalMinor ?? 0) : 0;
    const c = await customers.findOne({ orgId: ctx.org.id, id: e.customerId });
    if (c) {
      await customers.update({ id: c.id }, {
        $inc: { pointsBalance: delta },
        $set: { visits: isEarn && c.visits > 0 ? c.visits - 1 : c.visits, lifetimeSpendMinor: c.lifetimeSpendMinor >= spend ? c.lifetimeSpendMinor - spend : 0, updatedAt: now },
      });
    }
    await ledger.insert({
      id: newId("loyalty"), orgId: ctx.org.id, customerId: e.customerId, orderId, type: "reverse", points: delta,
      balanceAfter: await balanceOf(ctx, e.customerId), note: isEarn ? "Order voided or refunded: earned points removed" : "Order voided or refunded: points returned",
      createdBy: ctx.userId, createdAt: now,
    } as never);
  }
}

export async function searchCustomers(ctx: Ctx, q: string, limit = 8): Promise<{ id: string; name: string; phone: string | null; pointsBalance: number }[]> {
  const term = q.trim();
  if (!term) return [];
  const rows = await ctx.db.col<CustDoc>("customers").find({ orgId: ctx.org.id, isActive: true, ...customerSearchFilter(term) }, { sort: { name: 1 }, limit });
  return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone ?? null, pointsBalance: Number(r.pointsBalance) }));
}
