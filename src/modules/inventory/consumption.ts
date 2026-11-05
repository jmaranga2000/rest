import type { Ctx } from "@/platform/auth/context";
import type { Doc } from "@/platform/db";
import { requireBranch } from "@/platform/rbac/guard";
import { applyMovement } from "./ledger";

interface OrderLines { branchId: string; orderId: string; lines: { productId: string; qty: number }[] }

async function ingredientNeeds(ctx: Ctx, lines: OrderLines["lines"]): Promise<Map<string, number>> {
  const qtyByProduct = new Map<string, number>();
  for (const l of lines) qtyByProduct.set(l.productId, (qtyByProduct.get(l.productId) ?? 0) + l.qty);
  if (!qtyByProduct.size) return new Map();
  const rows = await ctx.db.col<Doc & { productId: string; itemId: string; qtyMilli: number }>("recipeLines").find({ orgId: ctx.org.id, productId: { $in: [...qtyByProduct.keys()] } });
  const needs = new Map<string, number>();
  for (const r of rows) needs.set(r.itemId, (needs.get(r.itemId) ?? 0) + Number(r.qtyMilli) * (qtyByProduct.get(r.productId) ?? 0));
  return needs;
}

/**
 * Deducts recipe ingredients for sold dishes. One 'sale' movement per ingredient. Products with no
 * recipe are ignored. Honours the org's allowNegativeStock policy. Called by the orders module
 * inside the order's transaction when items are sent to the kitchen.
 */
export async function consumeForOrderItems(ctx: Ctx, input: OrderLines): Promise<void> {
  if (!ctx.features.has("inventory")) return;
  requireBranch(ctx, input.branchId);
  const needs = await ingredientNeeds(ctx, input.lines);
  for (const [itemId, qty] of [...needs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (qty <= 0) continue;
    await applyMovement(ctx, { branchId: input.branchId, itemId, type: "sale", qtyDeltaMilli: -qty, refType: "order", refId: input.orderId, reason: "Used in order" });
  }
}

/**
 * Puts stock back (voided before preparation). Restores at the cost the original movements took it
 * out at, and never restores more than was actually consumed for that order (so a double reversal is a no-op).
 */
export async function reverseConsumption(ctx: Ctx, input: OrderLines): Promise<void> {
  if (!ctx.features.has("inventory")) return;
  requireBranch(ctx, input.branchId);
  const needs = await ingredientNeeds(ctx, input.lines);
  for (const [itemId, want] of [...needs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const moves = await ctx.db.col<Doc & { type: string; qtyDeltaMilli: number; valueDeltaMinor: number }>("stockMovements").find({ orgId: ctx.org.id, branchId: input.branchId, itemId, refType: "order", refId: input.orderId });
    const t = { soldQty: 0, soldValue: 0, backQty: 0, backValue: 0 };
    for (const mv of moves) {
      if (mv.type === "sale") { t.soldQty += -Number(mv.qtyDeltaMilli); t.soldValue += -Number(mv.valueDeltaMinor); }
      else if (mv.type === "sale_reversal") { t.backQty += Number(mv.qtyDeltaMilli); t.backValue += Number(mv.valueDeltaMinor); }
    }
    const remainingQty = t.soldQty - t.backQty;
    const qty = Math.min(want, remainingQty);
    if (qty <= 0) continue;
    const remainingValue = t.soldValue - t.backValue;
    const { mulDiv } = await import("./units");
    const value = qty === remainingQty ? remainingValue : mulDiv(remainingValue, qty, remainingQty);
    await applyMovement(ctx, { branchId: input.branchId, itemId, type: "sale_reversal", qtyDeltaMilli: qty, valueDeltaMinor: value, refType: "order", refId: input.orderId, reason: "Order item voided" });
  }
}
