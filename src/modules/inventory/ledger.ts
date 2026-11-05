import type { Ctx } from "@/platform/auth/context";
import type { Doc } from "@/platform/db";
import { BusinessRuleError, NotFoundError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { emit } from "@/platform/events/outbox";
import { requireBranch } from "@/platform/rbac/guard";
import { formatQty, mulDiv, type BaseUnit } from "./units";

export type MovementType = "opening" | "purchase" | "sale" | "sale_reversal" | "waste" | "adjustment" | "count" | "return";
export const MOVEMENT_LABEL: Record<MovementType, string> = {
  opening: "Opening balance", purchase: "Purchase", sale: "Used in sales", sale_reversal: "Sale reversed", waste: "Waste", adjustment: "Adjustment", count: "Stock count", return: "Return",
};

export interface MovementInput {
  branchId: string;
  itemId: string;
  type: MovementType;
  /** Signed thousandths of the base unit. */
  qtyDeltaMilli: number;
  /** Explicit value (purchases, openings). Omitted → valued at the current weighted average. */
  valueDeltaMinor?: number;
  refType?: string;
  refId?: string;
  reason?: string;
  /** Overrides the org's allowNegativeStock policy for this movement. */
  allowNegative?: boolean;
}
export interface MovementResult { qtyBefore: number; qtyAfter: number; valueAfter: number; valueDelta: number }

/**
 * Weighted-average valuation in integer math.
 *  + stock without explicit cost enters at the current average;
 *  − stock leaves at the current average (proportional share of value; emptying the shelf zeroes it).
 */
export function derivedValueDelta(qty: number, value: number, delta: number): number {
  if (delta === 0) return 0;
  if (delta > 0) return qty > 0 && value > 0 ? mulDiv(value, delta, qty) : 0;
  if (qty <= 0 || value <= 0) return 0;
  if (-delta >= qty) return -value;
  return -mulDiv(value, -delta, qty);
}

/**
 * The ONLY writer of stock. Appends a ledger row and moves the cached level in the same transaction
 * (callers run inside the action wrapper's transaction). The row is locked so concurrent sales
 * can't both read the same quantity.
 */
export async function applyMovement(ctx: Ctx, m: MovementInput): Promise<MovementResult> {
  requireBranch(ctx, m.branchId);
  const org = ctx.org.id;
  const item = await ctx.db.col<Doc & { name: string; unit: BaseUnit }>("inventoryItems").findOne({ orgId: org, id: m.itemId });
  if (!item) throw new NotFoundError("Stock item");
  const now = new Date().toISOString();

  // Touching the level document first takes a write lock on it for the rest of the transaction,
  // so two concurrent sales can't both read the same quantity (MongoDB retries the loser).
  const levelId = `${m.branchId}:${m.itemId}`;
  const lvl = await ctx.db.col<Doc & { qtyMilli: number; valueMinor: number; reorderLevelMilli: number }>("stockLevels").findOneAndUpdate(
    { id: levelId }, { $set: { updatedAt: now }, $setOnInsert: { orgId: org, branchId: m.branchId, itemId: m.itemId, qtyMilli: 0, valueMinor: 0, reorderLevelMilli: 0, parLevelMilli: 0 } }, { upsert: true });
  if (!lvl) throw new NotFoundError("Stock level");

  const qtyBefore = Number(lvl.qtyMilli);
  const valueBefore = Number(lvl.valueMinor);
  const qtyAfter = qtyBefore + m.qtyDeltaMilli;
  const negativeOk = m.allowNegative ?? (m.type === "sale" ? ctx.settings.allowNegativeStock : false);
  if (m.qtyDeltaMilli < 0 && qtyAfter < 0 && !negativeOk) {
    throw new BusinessRuleError(`Not enough ${item.name} in stock (have ${formatQty(Math.max(0, qtyBefore), item.unit)}, need ${formatQty(-m.qtyDeltaMilli, item.unit)}).`);
  }
  const valueDelta = m.valueDeltaMinor ?? derivedValueDelta(qtyBefore, valueBefore, m.qtyDeltaMilli);
  const valueAfter = qtyAfter <= 0 && m.qtyDeltaMilli < 0 ? 0 : valueBefore + valueDelta;

  await ctx.db.col("stockMovements").insert({
    id: newId("movement"), orgId: org, branchId: m.branchId, itemId: m.itemId, type: m.type, qtyDeltaMilli: m.qtyDeltaMilli,
    valueDeltaMinor: valueAfter - valueBefore, qtyAfterMilli: qtyAfter, refType: m.refType ?? null, refId: m.refId ?? null,
    reason: m.reason ?? null, createdBy: ctx.userId, createdAt: now,
  });
  await ctx.db.col("stockLevels").update({ id: levelId }, { $set: { qtyMilli: qtyAfter, valueMinor: valueAfter, updatedAt: now } });

  const reorder = Number(lvl.reorderLevelMilli);
  if (m.qtyDeltaMilli < 0 && qtyBefore > reorder && qtyAfter <= reorder) {
    await emit(ctx.db, { orgId: org, branchId: m.branchId, topic: "inventory", type: "stock.low", payload: { itemId: m.itemId, name: item.name, qtyMilli: qtyAfter } });
  }
  return { qtyBefore, qtyAfter, valueAfter, valueDelta: valueAfter - valueBefore };
}
