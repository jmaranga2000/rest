import type { Ctx } from "@/platform/auth/context";
import type { Doc, Filter } from "@/platform/db";
import { audit } from "@/platform/audit/audit";
import { newId } from "@/platform/ids";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import type { z } from "zod";
import { normalisePhone } from "./phone";
import type { CustomerInput, RewardInput, loyaltySettingsSchema, adjustPointsSchema } from "./schema";

export interface CustomerRow { id: string; name: string; phone: string | null; email: string | null; notes: string; pointsBalance: number; lifetimeSpendMinor: number; visits: number; lastVisitAt: string | null; isActive: boolean; createdAt: string }
export interface CustomerOrder { id: string; number: string; businessDate: string; status: string; type: string; totalMinor: number }
export interface LedgerEntry { id: string; type: "earn" | "redeem" | "adjust" | "reverse"; points: number; balanceAfter: number; note: string | null; orderId: string | null; createdAt: string }
export interface Reward { id: string; name: string; pointsCost: number; kind: "amount_off" | "percent_off"; value: number; isActive: boolean }
export interface CustomerPage { rows: CustomerRow[]; total: number; page: number; pageSize: number; pageCount: number }

export const PAGE_SIZE = 20;

type CustomerDoc = Doc & { name: string; phone: string | null; email: string | null; notes: string; pointsBalance: number; lifetimeSpendMinor: number; visits: number; lastVisitAt: string | null; isActive: boolean; createdAt: string };
const map = (r: CustomerDoc): CustomerRow => ({
  id: r.id, name: r.name, phone: r.phone ?? null, email: r.email ?? null, notes: r.notes ?? "", pointsBalance: Number(r.pointsBalance), lifetimeSpendMinor: Number(r.lifetimeSpendMinor),
  visits: Number(r.visits), lastVisitAt: r.lastVisitAt ?? null, isActive: r.isActive, createdAt: r.createdAt,
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Name-or-phone search filter shared by the list and the POS picker. */
export function customerSearchFilter(term: string): Filter {
  const t = term.trim();
  if (!t) return {};
  const digits = t.replace(/\D/g, "").replace(/^0+/, "");
  const byName: Filter = { name: { $regex: escapeRegex(t), $options: "i" } };
  return digits.length >= 3 ? { $or: [byName, { phone: { $regex: escapeRegex(digits) } }] } : byName;
}

export async function listCustomers(ctx: Ctx, opts: { q?: string; page?: number; includeInactive?: boolean } = {}): Promise<CustomerPage> {
  const filter: Filter = { orgId: ctx.org.id, ...(opts.includeInactive ? {} : { isActive: true }), ...customerSearchFilter(opts.q ?? "") };
  const col = ctx.db.col<CustomerDoc>("customers");
  const total = await col.count(filter);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), pageCount);
  const rows = await col.find(filter, { sort: { name: 1, id: 1 }, limit: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE });
  return { rows: rows.map(map), total, page, pageSize: PAGE_SIZE, pageCount };
}

export async function getCustomerProfile(ctx: Ctx, id: string): Promise<{ customer: CustomerRow; orders: CustomerOrder[]; ledger: LedgerEntry[] }> {
  const c = await ctx.db.col<CustomerDoc>("customers").findOne({ orgId: ctx.org.id, id });
  if (!c) throw new NotFoundError("Customer");
  const [orders, ledger] = await Promise.all([
    ctx.db.col<Doc & { number: string; businessDate: string; status: string; type: string; totalMinor: number }>("orders").find({ orgId: ctx.org.id, customerId: id }, { sort: { openedAt: -1 }, limit: 20 }),
    ctx.db.col<Doc & { type: LedgerEntry["type"]; points: number; balanceAfter: number; note: string | null; orderId: string | null; createdAt: string }>("loyaltyLedger").find({ orgId: ctx.org.id, customerId: id }, { sort: { createdAt: -1, id: -1 }, limit: 30 }),
  ]);
  return {
    customer: map(c),
    orders: orders.map((o) => ({ id: o.id, number: o.number, businessDate: o.businessDate, status: o.status, type: o.type, totalMinor: Number(o.totalMinor) })),
    ledger: ledger.map((l) => ({ id: l.id, type: l.type, points: Number(l.points), balanceAfter: Number(l.balanceAfter), note: l.note ?? null, orderId: l.orderId ?? null, createdAt: l.createdAt })),
  };
}

export async function saveCustomer(ctx: Ctx, input: CustomerInput): Promise<{ id: string }> {
  let phone: string | null = null;
  if (input.phone) {
    phone = normalisePhone(input.phone);
    if (!phone) throw new ValidationError(undefined, { phone: ["Enter a valid phone number, e.g. 0712 345 678."] });
    const dup = await ctx.db.col<CustomerDoc>("customers").findOne({ orgId: ctx.org.id, phone, id: { $ne: input.id ?? "" } });
    if (dup) throw new ConflictError(`${dup.name} already uses that phone number.`);
  }
  const now = new Date().toISOString();
  const row = { name: input.name, phone, email: input.email ?? null, notes: input.notes ?? "", isActive: input.isActive, updatedAt: now };
  if (input.id) {
    const n = await ctx.db.col("customers").update({ orgId: ctx.org.id, id: input.id }, { $set: row });
    if (!n) throw new NotFoundError("Customer");
    await audit(ctx, { action: "customers.updated", entityType: "customer", entityId: input.id, summary: `Updated customer "${input.name}"` });
    return { id: input.id };
  }
  const id = newId("customer");
  await ctx.db.col("customers").insert({ id, orgId: ctx.org.id, ...row, createdAt: now });
  await audit(ctx, { action: "customers.created", entityType: "customer", entityId: id, summary: `Added customer "${input.name}"` });
  return { id };
}

export async function setCustomerActive(ctx: Ctx, id: string, isActive: boolean): Promise<void> {
  const n = await ctx.db.col("customers").update({ orgId: ctx.org.id, id }, { $set: { isActive, updatedAt: new Date().toISOString() } });
  if (!n) throw new NotFoundError("Customer");
  await audit(ctx, { action: isActive ? "customers.restored" : "customers.archived", entityType: "customer", entityId: id, summary: isActive ? "Restored a customer" : "Archived a customer" });
}

export async function adjustPoints(ctx: Ctx, input: z.infer<typeof adjustPointsSchema>): Promise<{ balance: number }> {
  const now = new Date().toISOString();
  const customers = ctx.db.col<CustomerDoc>("customers");
  // Atomic guard: the balance can never go below zero, even under concurrent adjustments.
  const changed = await customers.update({ orgId: ctx.org.id, id: input.customerId, pointsBalance: { $gte: -input.points } }, { $inc: { pointsBalance: input.points }, $set: { updatedAt: now } });
  if (!changed) {
    if (!(await customers.findOne({ orgId: ctx.org.id, id: input.customerId }))) throw new NotFoundError("Customer");
    throw new ValidationError(undefined, { points: ["That would take the balance below zero."] });
  }
  const bal = Number((await customers.findOne({ orgId: ctx.org.id, id: input.customerId }))?.pointsBalance);
  await ctx.db.col("loyaltyLedger").insert({ id: newId("loyalty"), orgId: ctx.org.id, customerId: input.customerId, type: "adjust", points: input.points, balanceAfter: bal, note: input.reason, createdBy: ctx.userId, createdAt: now });
  await audit(ctx, { action: "loyalty.adjusted", entityType: "customer", entityId: input.customerId, summary: `Adjusted points by ${input.points}: ${input.reason}` });
  return { balance: bal };
}

// ---- Program & rewards --------------------------------------------------
export async function listRewards(ctx: Ctx): Promise<Reward[]> {
  const rows = await ctx.db.col<Doc & Omit<Reward, "id">>("loyaltyRewards").find({ orgId: ctx.org.id }, { sort: { pointsCost: 1, name: 1 } });
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, isActive: r.isActive, pointsCost: Number(r.pointsCost), value: Number(r.value) }));
}

export async function saveReward(ctx: Ctx, input: RewardInput): Promise<{ id: string }> {
  const row = { name: input.name, pointsCost: input.pointsCost, kind: input.kind, value: input.value, isActive: input.isActive };
  if (input.id) {
    const n = await ctx.db.col("loyaltyRewards").update({ orgId: ctx.org.id, id: input.id }, { $set: row });
    if (!n) throw new NotFoundError("Reward");
    await audit(ctx, { action: "loyalty.reward.updated", entityType: "reward", entityId: input.id, summary: `Updated reward "${input.name}"` });
    return { id: input.id };
  }
  const id = newId("reward");
  await ctx.db.col("loyaltyRewards").insert({ id, orgId: ctx.org.id, ...row, createdAt: new Date().toISOString() });
  await audit(ctx, { action: "loyalty.reward.created", entityType: "reward", entityId: id, summary: `Created reward "${input.name}"` });
  return { id };
}

/** Rewards are deactivated, not deleted, so past redemptions stay explainable. */
export async function deactivateReward(ctx: Ctx, id: string): Promise<void> {
  const n = await ctx.db.col("loyaltyRewards").update({ orgId: ctx.org.id, id }, { $set: { isActive: false } });
  if (!n) throw new NotFoundError("Reward");
  await audit(ctx, { action: "loyalty.reward.deactivated", entityType: "reward", entityId: id, summary: "Deactivated a reward" });
}

export async function saveLoyaltySettings(ctx: Ctx, input: z.infer<typeof loyaltySettingsSchema>): Promise<void> {
  await ctx.db.col("orgSettings").update({ id: ctx.org.id }, { $set: { loyaltyEnabled: input.enabled, loyaltyEarnPointsPer100: input.earnPointsPer100, loyaltyPointValueMinor: input.pointValueMinor, updatedAt: new Date().toISOString() } });
  await audit(ctx, { action: "loyalty.settings", summary: input.enabled ? `Loyalty on: ${input.earnPointsPer100} pt per 100` : "Loyalty turned off" });
}
