import type { Ctx } from "@/platform/auth/context";
import type { Doc } from "@/platform/db";
import { byIds, nextCounter } from "@/platform/db";
import { audit } from "@/platform/audit/audit";
import { newId } from "@/platform/ids";
import { BusinessRuleError, NotFoundError } from "@/platform/errors";
import { requireBranch } from "@/platform/rbac/guard";
import { nowIso } from "@/platform/dates";
import { applyMovement } from "./ledger";
import { parseQty, costPerDisplayUnit, type BaseUnit, type DisplayUnit } from "./units";
import type { ItemInput } from "./schema";
import type { z } from "zod";
import type { movementSchema, poSchema, receiveSchema, supplierSchema } from "./schema";

export interface StockRow { id: string; name: string; sku: string | null; category: string; unit: BaseUnit; supplierName: string | null; qtyMilli: number; valueMinor: number; reorderMilli: number; parMilli: number; costPerUnit: number | null; isLow: boolean }

export async function listStock(ctx: Ctx, branchId: string, opts: { q?: string; low?: boolean } = {}): Promise<StockRow[]> {
  requireBranch(ctx, branchId);
  const q = opts.q?.trim().toLowerCase();
  const org = ctx.org.id;
  const [items, levels, suppliers] = await Promise.all([
    ctx.db.col<Doc & { name: string; sku: string | null; category: string; unit: BaseUnit; supplierId: string | null }>("inventoryItems").find({ orgId: org, isActive: true }),
    ctx.db.col<Doc & { itemId: string; qtyMilli: number; valueMinor: number; reorderLevelMilli: number; parLevelMilli: number }>("stockLevels").find({ orgId: org, branchId }),
    ctx.db.col<Doc & { name: string }>("suppliers").find({ orgId: org }),
  ]);
  const lvl = new Map(levels.map((l) => [l.itemId, l]));
  const sup = new Map(suppliers.map((s) => [s.id, s.name]));
  const out = items
    .filter((i) => !q || i.name.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map((i) => {
      const l = lvl.get(i.id);
      const qtyMilli = Number(l?.qtyMilli ?? 0), valueMinor = Number(l?.valueMinor ?? 0), reorderMilli = Number(l?.reorderLevelMilli ?? 0);
      return { id: i.id, name: i.name, sku: i.sku ?? null, category: i.category, unit: i.unit, supplierName: i.supplierId ? sup.get(i.supplierId) ?? null : null, qtyMilli, valueMinor, reorderMilli, parMilli: Number(l?.parLevelMilli ?? 0),
        costPerUnit: costPerDisplayUnit(valueMinor, qtyMilli, i.unit), isLow: reorderMilli > 0 && qtyMilli <= reorderMilli };
    });
  return opts.low ? out.filter((r) => r.isLow) : out;
}

export async function saveItem(ctx: Ctx, i: ItemInput): Promise<{ id: string }> {
  requireBranch(ctx, i.branchId);
  const now = nowIso();
  let id = i.id;
  const items = ctx.db.col<Doc & { unit: string; name: string }>("inventoryItems");
  const dup = (await items.find({ orgId: ctx.org.id })).find((x) => x.id !== i.id && x.name.toLowerCase() === i.name.toLowerCase());
  if (dup) throw new BusinessRuleError(`A stock item named "${i.name}" already exists.`);
  if (id) {
    const cur = await items.findOne({ orgId: ctx.org.id, id });
    if (!cur) throw new NotFoundError("Stock item");
    if (cur.unit !== i.unit) throw new BusinessRuleError("An item's unit can't change once created. Create a new item instead.");
    await items.update({ orgId: ctx.org.id, id }, { $set: { name: i.name, sku: i.sku ?? null, category: i.category, supplierId: i.supplierId ?? null, updatedAt: now } });
  } else {
    id = newId("invItem");
    await items.insert({ id, orgId: ctx.org.id, name: i.name, sku: i.sku ?? null, category: i.category, unit: i.unit, supplierId: i.supplierId ?? null, createdAt: now, updatedAt: now });
  }
  await ctx.db.col("stockLevels").findOneAndUpdate({ id: `${i.branchId}:${id}` },
    { $set: { reorderLevelMilli: i.reorderMilli, parLevelMilli: i.parMilli, updatedAt: now }, $setOnInsert: { orgId: ctx.org.id, branchId: i.branchId, itemId: id, qtyMilli: 0, valueMinor: 0 } }, { upsert: true });
  if (!i.id && i.openingMilli > 0) await applyMovement(ctx, { branchId: i.branchId, itemId: id, type: "opening", qtyDeltaMilli: i.openingMilli, valueDeltaMinor: i.openingCostMinor ?? 0, reason: "Opening balance" });
  return { id };
}

export async function archiveItem(ctx: Ctx, id: string): Promise<void> {
  const used = await ctx.db.col("recipeLines").findOne({ orgId: ctx.org.id, itemId: id });
  if (used) throw new BusinessRuleError("This item is used in a recipe. Remove it from the recipe first.");
  await ctx.db.col("inventoryItems").update({ orgId: ctx.org.id, id }, { $set: { isActive: false, updatedAt: nowIso() } });
}

export async function recordMovement(ctx: Ctx, i: z.infer<typeof movementSchema>): Promise<{ qtyAfter: number }> {
  requireBranch(ctx, i.branchId);
  const milli = parseQty(i.qty, i.displayUnit as DisplayUnit);
  if (milli === null || milli <= 0) throw new BusinessRuleError("Enter a quantity greater than zero.");
  const item = await ctx.db.col<Doc & { unit: BaseUnit; name: string }>("inventoryItems").findOne({ orgId: ctx.org.id, id: i.itemId });
  if (!item) throw new NotFoundError("Stock item");
  const map = { receive: ["purchase", 1], waste: ["waste", -1], adjust_up: ["adjustment", 1], adjust_down: ["adjustment", -1] } as const;
  const [type, sign] = map[i.kind];
  if (type !== "purchase" && !i.reason) throw new BusinessRuleError("Give a reason for waste and adjustments.");
  const r = await applyMovement(ctx, { branchId: i.branchId, itemId: i.itemId, type, qtyDeltaMilli: sign * milli, valueDeltaMinor: i.kind === "receive" ? i.totalCostMinor ?? 0 : undefined, reason: i.reason || "Goods received" });
  await audit(ctx, { action: `stock.${i.kind}`, entityType: "inventory_item", entityId: i.itemId, branchId: i.branchId, summary: `${i.kind.replace("_", " ")} ${item.name}: ${sign * milli} milli${i.reason ? ` — ${i.reason}` : ""}` });
  return { qtyAfter: r.qtyAfter };
}

export async function listMovements(ctx: Ctx, branchId: string, itemId: string, limit = 50) {
  requireBranch(ctx, branchId);
  const rows = await ctx.db.col<Doc & { type: string; qtyDeltaMilli: number; valueDeltaMinor: number; qtyAfterMilli: number; reason: string | null; createdAt: string }>("stockMovements")
    .find({ orgId: ctx.org.id, branchId, itemId }, { sort: { createdAt: -1, id: -1 }, limit });
  return rows.map((r) => ({ id: r.id, type: r.type, qtyDeltaMilli: Number(r.qtyDeltaMilli), valueDeltaMinor: Number(r.valueDeltaMinor), qtyAfterMilli: Number(r.qtyAfterMilli), reason: r.reason ?? null, createdAt: r.createdAt }));
}

/* recipes */
export async function getRecipe(ctx: Ctx, productId: string) {
  const lines = await ctx.db.col<Doc & { itemId: string; qtyMilli: number }>("recipeLines").find({ orgId: ctx.org.id, productId });
  const items = await byIds<Doc & { name: string; unit: BaseUnit }>(ctx.db, "inventoryItems", ctx.org.id, lines.map((l) => l.itemId));
  return lines.flatMap((l) => { const it = items.get(l.itemId); return it ? [{ itemId: l.itemId, name: it.name, unit: it.unit, qtyMilli: Number(l.qtyMilli) }] : []; }).sort((a, b) => a.name.localeCompare(b.name));
}
export async function setRecipe(ctx: Ctx, productId: string, lines: { itemId: string; qtyMilli: number }[]): Promise<void> {
  const p = await ctx.db.col("products").findOne({ orgId: ctx.org.id, id: productId });
  if (!p) throw new NotFoundError("Product");
  const ids = [...new Set(lines.map((l) => l.itemId))];
  if (ids.length !== lines.length) throw new BusinessRuleError("An ingredient appears twice.");
  if (ids.length) {
    const n = await ctx.db.col("inventoryItems").count({ orgId: ctx.org.id, id: { $in: ids } });
    if (n !== ids.length) throw new NotFoundError("Stock item");
  }
  await ctx.db.col("recipeLines").delete({ orgId: ctx.org.id, productId });
  if (lines.length) await ctx.db.col("recipeLines").insertMany(lines.map((l) => ({ id: `${productId}:${l.itemId}`, orgId: ctx.org.id, productId, itemId: l.itemId, qtyMilli: l.qtyMilli })));
  await audit(ctx, { action: "recipe.update", entityType: "product", entityId: productId, summary: `Recipe updated (${lines.length} ingredients)` });
}

/* suppliers & purchase orders */
export interface SupplierRow { id: string; name: string; contact: string | null; phone: string | null; email: string | null; address: string | null; notes: string; isActive: boolean }
export async function listSuppliers(ctx: Ctx): Promise<SupplierRow[]> {
  const rows = await ctx.db.col<Doc & Omit<SupplierRow, "id">>("suppliers").find({ orgId: ctx.org.id });
  return rows.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
    .map((r) => ({ id: r.id, name: r.name, contact: r.contact ?? null, phone: r.phone ?? null, email: r.email ?? null, address: r.address ?? null, notes: r.notes ?? "", isActive: r.isActive }));
}
export async function saveSupplier(ctx: Ctx, i: z.infer<typeof supplierSchema>): Promise<{ id: string }> {
  const now = nowIso();
  const data = { name: i.name, contact: i.contact ?? null, phone: i.phone ?? null, email: i.email ?? null, address: i.address ?? null, notes: i.notes ?? "", ...(i.isActive !== undefined ? { isActive: i.isActive } : {}), updatedAt: now };
  if (i.id) { await ctx.db.col("suppliers").update({ orgId: ctx.org.id, id: i.id }, { $set: data }); return { id: i.id }; }
  const id = newId("supplier");
  await ctx.db.col("suppliers").insert({ id, orgId: ctx.org.id, ...data, createdAt: now });
  return { id };
}

export interface PoRow { id: string; number: string; branchId: string; supplierId: string; supplierName: string; status: "draft" | "ordered" | "partial" | "received" | "cancelled"; expectedOn: string | null; notes: string; totalMinor: number; createdAt: string; lines: { id: string; itemId: string; name: string; unit: BaseUnit; qtyMilli: number; lineTotalMinor: number; receivedMilli: number; receivedTotalMinor: number }[] }
export async function listPurchaseOrders(ctx: Ctx, branchId: string): Promise<PoRow[]> {
  requireBranch(ctx, branchId);
  const org = ctx.org.id;
  const pos = await ctx.db.col<Doc & { number: string; supplierId: string; status: PoRow["status"]; expectedOn: string | null; notes: string; totalMinor: number; createdAt: string }>("purchaseOrders")
    .find({ orgId: org, branchId }, { sort: { createdAt: -1, id: -1 }, limit: 100 });
  if (!pos.length) return [];
  const lines = await ctx.db.col<Doc & { poId: string; itemId: string; qtyMilli: number; lineTotalMinor: number; receivedMilli: number; receivedTotalMinor: number }>("purchaseOrderLines").find({ orgId: org, poId: { $in: pos.map((p) => p.id) } }, { sort: { id: 1 } });
  const [sups, items] = await Promise.all([
    byIds<Doc & { name: string }>(ctx.db, "suppliers", org, pos.map((p) => p.supplierId)),
    byIds<Doc & { name: string; unit: BaseUnit }>(ctx.db, "inventoryItems", org, lines.map((l) => l.itemId)),
  ]);
  return pos.map((p) => ({
    id: p.id, number: p.number, branchId, supplierId: p.supplierId, supplierName: sups.get(p.supplierId)?.name ?? "", status: p.status, expectedOn: p.expectedOn ?? null, notes: p.notes ?? "", totalMinor: Number(p.totalMinor), createdAt: p.createdAt,
    lines: lines.filter((l) => l.poId === p.id).flatMap((l) => { const it = items.get(l.itemId); return it ? [{ id: l.id, itemId: l.itemId, name: it.name, unit: it.unit, qtyMilli: Number(l.qtyMilli), lineTotalMinor: Number(l.lineTotalMinor), receivedMilli: Number(l.receivedMilli), receivedTotalMinor: Number(l.receivedTotalMinor) }] : []; }),
  }));
}
async function loadPo(ctx: Ctx, id: string) {
  const po = await ctx.db.col<Doc & { branchId: string; status: PoRow["status"]; number: string }>("purchaseOrders").findOne({ orgId: ctx.org.id, id });
  if (!po) throw new NotFoundError("Purchase order");
  requireBranch(ctx, po.branchId);
  return po;
}
export async function savePurchaseOrder(ctx: Ctx, i: z.infer<typeof poSchema>): Promise<{ id: string }> {
  requireBranch(ctx, i.branchId);
  const sup = await ctx.db.col("suppliers").findOne({ orgId: ctx.org.id, id: i.supplierId, isActive: true });
  if (!sup) throw new NotFoundError("Supplier");
  const total = i.lines.reduce((a, l) => a + l.lineTotalMinor, 0);
  const now = nowIso();
  let id = i.id;
  if (id) {
    const po = await loadPo(ctx, id);
    if (po.status !== "draft") throw new BusinessRuleError("Only draft orders can be edited.");
    await ctx.db.col("purchaseOrders").update({ orgId: ctx.org.id, id }, { $set: { supplierId: i.supplierId, expectedOn: i.expectedOn ?? null, notes: i.notes ?? "", totalMinor: total, updatedAt: now } });
    await ctx.db.col("purchaseOrderLines").delete({ orgId: ctx.org.id, poId: id });
  } else {
    id = newId("po");
    const n = await nextCounter(ctx.db, ctx.org.id, i.branchId, "po");
    await ctx.db.col("purchaseOrders").insert({ id, orgId: ctx.org.id, branchId: i.branchId, supplierId: i.supplierId, number: `PO-${String(n).padStart(4, "0")}`, status: "draft", expectedOn: i.expectedOn ?? null, notes: i.notes ?? "", totalMinor: total, createdBy: ctx.userId, createdAt: now, updatedAt: now });
  }
  await ctx.db.col("purchaseOrderLines").insertMany(i.lines.map((l) => ({ id: newId("poLine"), orgId: ctx.org.id, poId: id!, itemId: l.itemId, qtyMilli: l.qtyMilli, lineTotalMinor: l.lineTotalMinor, receivedMilli: 0, receivedTotalMinor: 0 })));
  return { id };
}
export async function markOrdered(ctx: Ctx, id: string): Promise<void> {
  const po = await loadPo(ctx, id);
  if (po.status !== "draft") throw new BusinessRuleError("Only draft orders can be sent.");
  await ctx.db.col("purchaseOrders").update({ orgId: ctx.org.id, id }, { $set: { status: "ordered", orderedAt: nowIso(), updatedAt: nowIso() } });
}
export async function cancelPo(ctx: Ctx, id: string): Promise<void> {
  const po = await loadPo(ctx, id);
  if (po.status !== "draft" && po.status !== "ordered") throw new BusinessRuleError("This order already has deliveries and can't be cancelled.");
  await ctx.db.col("purchaseOrders").update({ orgId: ctx.org.id, id }, { $set: { status: "cancelled", updatedAt: nowIso() } });
}
/** Books goods received. Each delivered line goes into the stock ledger at its actual cost; the order becomes partial/received. */
export async function receivePo(ctx: Ctx, i: z.infer<typeof receiveSchema>): Promise<{ status: PoRow["status"] }> {
  const po = await loadPo(ctx, i.id);
  if (po.status !== "ordered" && po.status !== "partial") throw new BusinessRuleError("Only sent orders can be received.");
  const lcol = ctx.db.col<Doc & { itemId: string; qtyMilli: number; receivedMilli: number }>("purchaseOrderLines");
  for (const r of i.lines) {
    if (r.qtyMilli === 0) continue;
    const l = await lcol.findOne({ orgId: ctx.org.id, id: r.lineId, poId: i.id });
    if (!l) throw new NotFoundError("Order line");
    await applyMovement(ctx, { branchId: po.branchId, itemId: l.itemId, type: "purchase", qtyDeltaMilli: r.qtyMilli, valueDeltaMinor: r.totalMinor, refType: "purchase_order", refId: i.id, reason: `Received on ${po.number}` });
    await lcol.update({ orgId: ctx.org.id, id: r.lineId }, { $inc: { receivedMilli: r.qtyMilli, receivedTotalMinor: r.totalMinor } });
  }
  const all = await lcol.find({ orgId: ctx.org.id, poId: i.id });
  const open = all.filter((l) => Number(l.receivedMilli) < Number(l.qtyMilli)).length;
  const got = all.reduce((a, l) => a + Number(l.receivedMilli), 0);
  const status = open === 0 ? "received" : got > 0 ? "partial" : "ordered";
  await ctx.db.col("purchaseOrders").update({ orgId: ctx.org.id, id: i.id }, { $set: { status, receivedAt: status === "received" ? nowIso() : null, updatedAt: nowIso() } });
  await audit(ctx, { action: "po.receive", entityType: "purchase_order", entityId: i.id, branchId: po.branchId, summary: `Received goods on ${po.number} (${status})` });
  return { status };
}
