import type { Ctx } from "@/platform/auth/context";
import type { Doc, Filter } from "@/platform/db";
import { byIds, nextCounter } from "@/platform/db";
import { audit } from "@/platform/audit/audit";
import { newId } from "@/platform/ids";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/platform/errors";
import { requireBranch, requirePermission } from "@/platform/rbac/guard";
import { emit } from "@/platform/events/outbox";
import { businessDate, hourInZone, nowIso } from "@/platform/dates";
import { getCatalog, effectivePrice } from "@/modules/menu/service";
import { consumeForOrderItems, reverseConsumption } from "@/modules/inventory/consumption";
import { onOrderPaid, redeemReward, reverseLoyaltyForOrder, rewardDiscount } from "@/modules/customers/loyalty";
import { priceOrder, changeDue, type DiscountSpec } from "./pricing";
import { canMoveItem, type ItemStatus, type OrderItemView, type OrderView, type PaymentView } from "./types";
import type { AddItemInput, OpenOrderInput, PayInput } from "./schema";

/* ------------------------------------------------------------------ reading */

/** Stored order document (snapshots of tax settings live on the order so history never changes). */
interface OrderDoc extends Doc {
  branchId: string; number: string; seq: number; businessDate: string; type: string; status: "open" | "closed" | "void";
  tableId: string | null; customerId: string | null; guests: number | null; notes: string | null;
  currency: string; subtotalMinor: number; discountMinor: number; discountKind: "percent" | "amount" | null; discountValue: number | null; discountReason: string | null;
  rewardId: string | null; rewardDiscountMinor: number; rewardPoints: number; serviceChargeMinor: number; taxMinor: number; totalMinor: number; paidMinor: number; tipMinor: number;
  taxInclusive: boolean; taxRateBp: number; serviceChargeBp: number; serviceChargeTaxable: boolean; openedBy: string | null; openedAt: string;
  closedAt: string | null; voidedAt: string | null; voidReason: string | null; version: number;
  roomId?: string | null; bookingId?: string | null; roomLabel?: string | null; source?: string | null;
}
/** Order document plus the display names joined in at read time. */
interface OrderRow extends OrderDoc { tableLabel: string | null; customerName: string | null; openedByName: string | null }

async function hydrate(ctx: Ctx, docs: OrderDoc[]): Promise<OrderRow[]> {
  const org = ctx.org.id;
  const [tables, customers, users] = await Promise.all([
    byIds<Doc & { label: string }>(ctx.db, "diningTables", org, docs.map((d) => d.tableId)),
    byIds<Doc & { name: string }>(ctx.db, "customers", org, docs.map((d) => d.customerId)),
    byIds<Doc & { name: string }>(ctx.db, "users", org, docs.map((d) => d.openedBy)),
  ]);
  return docs.map((d) => ({ ...d, tableLabel: d.tableId ? tables.get(d.tableId)?.label ?? null : d.roomLabel ? `Room ${d.roomLabel}` : null, customerName: d.customerId ? customers.get(d.customerId)?.name ?? null : null, openedByName: d.openedBy ? users.get(d.openedBy)?.name ?? null : null }));
}

async function loadRow(ctx: Ctx, orderId: string): Promise<OrderRow> {
  const doc = await ctx.db.col<OrderDoc>("orders").findOne({ orgId: ctx.org.id, id: orderId });
  if (!doc) throw new NotFoundError("Order");
  requireBranch(ctx, doc.branchId);
  return (await hydrate(ctx, [doc]))[0]!;
}

type ItemDoc = Doc & {
  orderId: string; productId: string; variantId: string | null; name: string; variantName: string | null; qty: number; unitPriceMinor: number; modifiersMinor: number; lineTotalMinor: number;
  isTaxExempt: boolean; note: string | null; status: ItemStatus; round: number; stationId: string | null; sentAt: string | null; readyAt: string | null; voidReason: string | null; createdAt: string;
};
const byCreated = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1);

async function loadItems(ctx: Ctx, orderIds: string[]): Promise<Map<string, OrderItemView[]>> {
  const out = new Map<string, OrderItemView[]>();
  if (!orderIds.length) return out;
  const items = (await ctx.db.col<ItemDoc>("orderItems").find({ orgId: ctx.org.id, orderId: { $in: orderIds } })).sort(byCreated);
  const mods = items.length ? await ctx.db.col<Doc & { orderItemId: string; name: string; priceMinor: number }>("orderItemModifiers").find({ orgId: ctx.org.id, orderItemId: { $in: items.map((i) => i.id) } }, { sort: { id: 1 } }) : [];
  const byItem = new Map<string, { name: string; priceMinor: number }[]>();
  for (const m of mods) (byItem.get(m.orderItemId) ?? byItem.set(m.orderItemId, []).get(m.orderItemId)!).push({ name: m.name, priceMinor: Number(m.priceMinor) });
  for (const i of items) {
    const view: OrderItemView = {
      id: i.id, productId: i.productId, name: i.name, variantName: i.variantName ?? null, qty: Number(i.qty), unitPriceMinor: Number(i.unitPriceMinor),
      modifiersMinor: Number(i.modifiersMinor), lineTotalMinor: Number(i.lineTotalMinor), note: i.note ?? null, status: i.status, round: Number(i.round),
      stationId: i.stationId ?? null, modifiers: byItem.get(i.id) ?? [], sentAt: i.sentAt ?? null, readyAt: i.readyAt ?? null, voidReason: i.voidReason ?? null,
    };
    (out.get(i.orderId) ?? out.set(i.orderId, []).get(i.orderId)!).push(view);
  }
  return out;
}

async function loadPayments(ctx: Ctx, orderIds: string[]): Promise<Map<string, PaymentView[]>> {
  const out = new Map<string, PaymentView[]>();
  if (!orderIds.length) return out;
  const rows = (await ctx.db.col<Doc & { orderId: string; method: string; amountMinor: number; tenderedMinor: number | null; changeMinor: number; tipMinor: number; reference: string | null; refundOfId: string | null; reason: string | null; createdAt: string; createdBy: string | null }>("payments")
    .find({ orgId: ctx.org.id, orderId: { $in: orderIds } })).sort(byCreated);
  const users = await byIds<Doc & { name: string }>(ctx.db, "users", ctx.org.id, rows.map((r) => r.createdBy));
  for (const r of rows) {
    const v: PaymentView = { id: r.id, method: r.method, amountMinor: Number(r.amountMinor), tenderedMinor: r.tenderedMinor == null ? null : Number(r.tenderedMinor), changeMinor: Number(r.changeMinor),
      tipMinor: Number(r.tipMinor), reference: r.reference ?? null, refundOfId: r.refundOfId ?? null, reason: r.reason ?? null, createdAt: r.createdAt, createdByName: r.createdBy ? users.get(r.createdBy)?.name ?? null : null };
    (out.get(r.orderId) ?? out.set(r.orderId, []).get(r.orderId)!).push(v);
  }
  return out;
}

function toView(r: OrderRow, items: OrderItemView[], payments: PaymentView[]): OrderView {
  return {
    id: r.id, branchId: r.branchId, number: r.number, seq: Number(r.seq), businessDate: r.businessDate, type: r.type, status: r.status, tableId: r.tableId ?? null, tableLabel: r.tableLabel,
    customerId: r.customerId ?? null, customerName: r.customerName, guests: r.guests == null ? null : Number(r.guests), notes: r.notes ?? null, currency: r.currency,
    subtotalMinor: Number(r.subtotalMinor), discountMinor: Number(r.discountMinor), discountKind: r.discountKind ?? null, discountValue: r.discountValue == null ? null : Number(r.discountValue),
    discountReason: r.discountReason ?? null, rewardDiscountMinor: Number(r.rewardDiscountMinor), rewardPoints: Number(r.rewardPoints), serviceChargeMinor: Number(r.serviceChargeMinor),
    taxMinor: Number(r.taxMinor), totalMinor: Number(r.totalMinor), paidMinor: Number(r.paidMinor), tipMinor: Number(r.tipMinor), taxInclusive: r.taxInclusive, taxRateBp: Number(r.taxRateBp),
    openedByName: r.openedByName, openedAt: r.openedAt, closedAt: r.closedAt ?? null, voidedAt: r.voidedAt ?? null, voidReason: r.voidReason ?? null, version: Number(r.version), items, payments,
  };
}

export async function getOrder(ctx: Ctx, orderId: string): Promise<OrderView> {
  requirePermission(ctx, "orders.view");
  const row = await loadRow(ctx, orderId);
  const [items, pays] = await Promise.all([loadItems(ctx, [orderId]), loadPayments(ctx, [orderId])]);
  return toView(row, items.get(orderId) ?? [], pays.get(orderId) ?? []);
}

export interface OrderListFilter { branchId?: string; status?: "open" | "closed" | "void"; from?: string; to?: string; q?: string; limit?: number }
export async function listOrders(ctx: Ctx, f: OrderListFilter = {}): Promise<Omit<OrderView, "items" | "payments">[]> {
  requirePermission(ctx, "orders.view");
  const branchIds = f.branchId ? [requireBranch(ctx, f.branchId).id] : ctx.branches.map((b) => b.id);
  if (!branchIds.length) return [];
  const q = f.q?.trim().toLowerCase();
  const filter: Filter = { orgId: ctx.org.id, branchId: { $in: branchIds }, ...(f.status ? { status: f.status } : {}) };
  if (f.from || f.to) filter.businessDate = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
  const limit = Math.min(f.limit ?? 100, 500);
  let docs: OrderDoc[];
  if (q) {
    // Search matches order number or customer name; resolve names first, then filter.
    const all = await ctx.db.col<OrderDoc>("orders").find(filter, { sort: { openedAt: -1, id: -1 } });
    const hydrated = await hydrate(ctx, all);
    return hydrated.filter((r) => r.number.toLowerCase().includes(q) || (r.customerName ?? "").toLowerCase().includes(q)).slice(0, limit).map((r) => toView(r, [], []));
  }
  docs = await ctx.db.col<OrderDoc>("orders").find(filter, { sort: { openedAt: -1, id: -1 }, limit });
  return (await hydrate(ctx, docs)).map((r) => toView(r, [], []));
}

/** Open (unpaid) orders of a branch with items, for the POS order picker and floor map. */
export async function listOpenOrders(ctx: Ctx, branchId: string): Promise<OrderView[]> {
  requirePermission(ctx, "orders.view");
  requireBranch(ctx, branchId);
  const rows = await hydrate(ctx, await ctx.db.col<OrderDoc>("orders").find({ orgId: ctx.org.id, branchId, status: "open" }, { sort: { openedAt: 1, id: 1 } }));
  const ids = rows.map((r) => r.id);
  const [items, pays] = await Promise.all([loadItems(ctx, ids), loadPayments(ctx, ids)]);
  return rows.map((r) => toView(r, items.get(r.id) ?? [], pays.get(r.id) ?? []));
}

/* ------------------------------------------------------------------ helpers */

function assertOpen(o: Pick<OrderRow, "status">): void {
  if (o.status !== "open") throw new BusinessRuleError(`This order is ${o.status}.`);
}

/** Recalculates totals from live items + discounts and stores them. */
async function reprice(ctx: Ctx, orderId: string): Promise<void> {
  const o = await loadRow(ctx, orderId);
  const items = (await ctx.db.col<ItemDoc>("orderItems").find({ orgId: ctx.org.id, orderId, status: { $ne: "void" } })).sort(byCreated);
  const discount: DiscountSpec = o.discountKind && o.discountValue != null ? { kind: o.discountKind, value: Number(o.discountValue) } : null;
  const subtotal = items.reduce((a, i) => a + (Number(i.unitPriceMinor) + Number(i.modifiersMinor)) * Number(i.qty), 0);
  // A reward is re-derived from the points it cost, so it follows the basket when items change.
  const reward = o.rewardId ? await ctx.db.col<Doc & { kind: "amount_off" | "percent_off"; value: number }>("loyaltyRewards").findOne({ orgId: ctx.org.id, id: o.rewardId }) : null;
  const rewardMinor = reward ? rewardDiscount({ kind: reward.kind, value: Number(reward.value) }, subtotal) : 0;
  const p = priceOrder(
    items.map((i) => ({ unitMinor: Number(i.unitPriceMinor) + Number(i.modifiersMinor), qty: Number(i.qty), taxExempt: i.isTaxExempt })),
    discount, rewardMinor,
    { taxRateBp: Number(o.taxRateBp), taxInclusive: o.taxInclusive, serviceChargeBp: Number(o.serviceChargeBp), serviceChargeTaxable: o.serviceChargeTaxable },
  );
  await ctx.db.col("orders").update({ orgId: ctx.org.id, id: orderId }, {
    $set: { subtotalMinor: p.subtotalMinor, discountMinor: p.discountMinor, rewardDiscountMinor: rewardMinor, serviceChargeMinor: p.serviceChargeMinor, taxMinor: p.taxMinor, totalMinor: p.totalMinor, updatedAt: nowIso() },
    $inc: { version: 1 },
  });
}

async function announce(ctx: Ctx, o: Pick<OrderRow, "id" | "branchId">, type: string, topics: ("orders" | "kitchen" | "display")[] = ["orders"], payload: Record<string, unknown> = {}): Promise<void> {
  for (const topic of topics) await emit(ctx.db, { orgId: ctx.org.id, branchId: o.branchId, topic, type, payload: { orderId: o.id, ...payload } });
}

/* ------------------------------------------------------------------ order lifecycle */

export async function openOrder(ctx: Ctx, input: OpenOrderInput, extra: Record<string, unknown> = {}): Promise<OrderView> {
  requirePermission(ctx, "orders.create");
  const branch = requireBranch(ctx, input.branchId);
  if (!ctx.settings.orderTypes.includes(input.type)) throw new BusinessRuleError("That order type is not enabled for this business.");
  const orders = ctx.db.col<OrderDoc>("orders");

  if (input.clientKey) {
    const dup = await orders.findOne({ orgId: ctx.org.id, clientKey: input.clientKey });
    if (dup) return getOrder(ctx, dup.id);
  }
  if (input.tableId) {
    if (input.type !== "dine_in") throw new BusinessRuleError("Only dine-in orders use a table.");
    const t = await ctx.db.col("diningTables").findOne({ orgId: ctx.org.id, branchId: branch.id, id: input.tableId, isActive: true });
    if (!t) throw new NotFoundError("Table");
    const taken = await orders.findOne({ orgId: ctx.org.id, tableId: input.tableId, status: "open" });
    if (taken) throw new ConflictError(`Table already has open order ${taken.number}.`);
  }
  if (input.customerId) {
    const c = await ctx.db.col("customers").findOne({ orgId: ctx.org.id, id: input.customerId });
    if (!c) throw new NotFoundError("Customer");
  }

  const now = new Date();
  const date = businessDate(now, branch.timezone || ctx.org.timezone);
  const seq = await nextCounter(ctx.db, ctx.org.id, branch.id, `order:${date}`);
  const id = newId("order");
  const s = ctx.settings;
  await orders.insert({
    id, orgId: ctx.org.id, branchId: branch.id, seq, number: `${date.slice(5).replace("-", "")}-${String(seq).padStart(3, "0")}`, businessDate: date,
    openedHour: hourInZone(now, branch.timezone || ctx.org.timezone), type: input.type, status: "open", tableId: input.tableId ?? null, customerId: input.customerId ?? null,
    guests: input.guests ?? null, notes: input.notes ?? null, currency: ctx.org.currency, taxRateBp: s.taxRateBp, taxInclusive: s.taxInclusive,
    serviceChargeBp: s.serviceChargeTypes.includes(input.type) ? s.serviceChargeBp : 0, serviceChargeTaxable: s.serviceChargeTaxable,
    subtotalMinor: 0, discountMinor: 0, rewardDiscountMinor: 0, rewardPoints: 0, serviceChargeMinor: 0, taxMinor: 0, totalMinor: 0, paidMinor: 0, tipMinor: 0, version: 1,
    openedBy: ctx.userId, openedAt: now.toISOString(), clientKey: input.clientKey ?? null, updatedAt: now.toISOString(), ...extra,
  } as never);
  await announce(ctx, { id, branchId: branch.id }, "order.opened");
  return getOrder(ctx, id);
}

/** `extra` is stamped on every item created by this call (guest key, source, …). Returns the new item ids via `created` when given. */
export async function addItems(ctx: Ctx, orderId: string, items: AddItemInput[], extra: Record<string, unknown> = {}, created?: string[]): Promise<OrderView> {
  requirePermission(ctx, "orders.create");
  const order = await loadRow(ctx, orderId);
  assertOpen(order);
  const catalog = await getCatalog(ctx, { branchId: order.branchId });
  const groups = new Map(catalog.modifierGroups.map((g) => [g.id, g]));
  const now = nowIso();

  for (const it of items) {
    const p = catalog.products.find((x) => x.id === it.productId);
    if (!p) throw new NotFoundError("Product");
    if (!p.isAvailable) throw new BusinessRuleError(`${p.name} is not available right now.`);
    const variant = it.variantId ? p.variants.find((v) => v.id === it.variantId) : p.variants.find((v) => v.isDefault) ?? null;
    if (it.variantId && !variant) throw new NotFoundError("Variant");
    if (!it.variantId && p.variants.length > 1) throw new BusinessRuleError(`Choose a size for ${p.name}.`);

    const chosen = new Set(it.optionIds ?? []);
    const picked: { id: string; group: string; name: string; priceMinor: number }[] = [];
    for (const gid of p.modifierGroupIds) {
      const g = groups.get(gid);
      if (!g) continue;
      const sel = g.options.filter((o) => chosen.has(o.id));
      if (sel.length < g.minSelect) throw new BusinessRuleError(`${p.name}: choose at least ${g.minSelect} for "${g.name}".`);
      if (g.maxSelect > 0 && sel.length > g.maxSelect) throw new BusinessRuleError(`${p.name}: choose at most ${g.maxSelect} for "${g.name}".`);
      for (const o of sel) { picked.push({ id: o.id, group: g.name, name: o.name, priceMinor: o.priceMinor }); chosen.delete(o.id); }
    }
    if (chosen.size) throw new BusinessRuleError("An option does not belong to this product.");

    const unit = variant ? variant.priceMinor : effectivePrice(p);
    const mods = picked.reduce((a, m) => a + m.priceMinor, 0);
    const itemId = newId("orderItem");
    await ctx.db.col("orderItems").insert({
      id: itemId, orgId: ctx.org.id, orderId, productId: p.id, variantId: variant?.id ?? null, stationId: p.stationId, name: p.name, variantName: variant && p.variants.length > 1 ? variant.name : null,
      qty: it.qty, unitPriceMinor: unit, modifiersMinor: mods, lineTotalMinor: (unit + mods) * it.qty, isTaxExempt: p.isTaxExempt, note: it.note ?? null, status: "held", round: 0, createdAt: now, ...extra,
    });
    created?.push(itemId);
    for (const m of picked) await ctx.db.col("orderItemModifiers").insert({ id: newId("orderItem"), orgId: ctx.org.id, orderItemId: itemId, optionId: m.id, groupName: m.group, name: m.name, priceMinor: m.priceMinor });
  }
  await reprice(ctx, orderId);
  await announce(ctx, order, "order.updated");
  return getOrder(ctx, orderId);
}

async function loadItem(ctx: Ctx, itemId: string) {
  const it = await ctx.db.col<ItemDoc>("orderItems").findOne({ orgId: ctx.org.id, id: itemId });
  if (!it) throw new NotFoundError("Order item");
  const o = await ctx.db.col<OrderDoc>("orders").findOne({ orgId: ctx.org.id, id: it.orderId });
  if (!o) throw new NotFoundError("Order");
  requireBranch(ctx, o.branchId);
  return { id: it.id, orderId: it.orderId, productId: it.productId, qty: it.qty, status: it.status, unitPriceMinor: it.unitPriceMinor, modifiersMinor: it.modifiersMinor, branchId: o.branchId, orderStatus: o.status };
}

/** Quantity / note change; only possible before the item is sent. */
export async function updateItem(ctx: Ctx, itemId: string, patch: { qty?: number; note?: string | null }): Promise<OrderView> {
  requirePermission(ctx, "orders.create");
  const it = await loadItem(ctx, itemId);
  if (it.orderStatus !== "open") throw new BusinessRuleError(`This order is ${it.orderStatus}.`);
  if (it.status !== "held" && patch.qty !== undefined) throw new BusinessRuleError("This item was already sent to the kitchen. Void it and add it again.");
  const qty = patch.qty ?? Number(it.qty);
  await ctx.db.col("orderItems").update({ orgId: ctx.org.id, id: itemId }, { $set: { qty, lineTotalMinor: (Number(it.unitPriceMinor) + Number(it.modifiersMinor)) * qty, ...(patch.note !== undefined ? { note: patch.note } : {}) } });
  await reprice(ctx, it.orderId);
  await announce(ctx, { id: it.orderId, branchId: it.branchId }, "order.updated");
  return getOrder(ctx, it.orderId);
}

/** Removes an unsent item outright (no trace needed). */
export async function removeHeldItem(ctx: Ctx, itemId: string): Promise<OrderView> {
  requirePermission(ctx, "orders.create");
  const it = await loadItem(ctx, itemId);
  if (it.orderStatus !== "open") throw new BusinessRuleError(`This order is ${it.orderStatus}.`);
  if (it.status !== "held") throw new BusinessRuleError("This item was already sent. Void it with a reason instead.");
  await ctx.db.col("orderItemModifiers").delete({ orgId: ctx.org.id, orderItemId: itemId });
  await ctx.db.col("orderItems").delete({ orgId: ctx.org.id, id: itemId });
  await reprice(ctx, it.orderId);
  await announce(ctx, { id: it.orderId, branchId: it.branchId }, "order.updated");
  return getOrder(ctx, it.orderId);
}

export async function sendToKitchen(ctx: Ctx, orderId: string, only?: { itemIds: string[] }): Promise<OrderView> {
  requirePermission(ctx, "orders.create");
  const order = await loadRow(ctx, orderId);
  assertOpen(order);
  const items = ctx.db.col<ItemDoc>("orderItems");
  const only_ = only ? new Set(only.itemIds) : null;
  const held = (await items.find({ orgId: ctx.org.id, orderId, status: "held" })).filter((h) => !only_ || only_.has(h.id)).sort(byCreated);
  if (!held.length) throw new BusinessRuleError("Nothing new to send.");
  const all = await items.find({ orgId: ctx.org.id, orderId });
  const round = all.reduce((m, i) => Math.max(m, Number(i.round)), 0) + 1;
  const now = nowIso();
  await items.update({ orgId: ctx.org.id, orderId, status: "held", id: { $in: held.map((h) => h.id) } }, { $set: { status: "sent", round, sentAt: now } });
  await consumeForOrderItems(ctx, { branchId: order.branchId, orderId, lines: held.map((h) => ({ productId: h.productId, qty: Number(h.qty) })) });
  await ctx.db.col("orders").update({ orgId: ctx.org.id, id: orderId }, { $inc: { version: 1 }, $set: { updatedAt: now } });
  await announce(ctx, order, "order.sent", ["orders", "kitchen"], { round });
  return getOrder(ctx, orderId);
}

/** Kitchen/floor status progression for one item. */
export async function setItemStatus(ctx: Ctx, itemId: string, to: ItemStatus): Promise<void> {
  if (to === "void") throw new BusinessRuleError("Use voiding to cancel an item.");
  if (to === "served") requirePermission(ctx, "orders.edit"); else requirePermission(ctx, "kitchen.operate");
  const it = await loadItem(ctx, itemId);
  if (!canMoveItem(it.status, to)) throw new BusinessRuleError(`An item that is "${it.status}" cannot become "${to}".`);
  const now = nowIso();
  const field = to === "preparing" ? "startedAt" : to === "ready" ? "readyAt" : "servedAt";
  await ctx.db.col("orderItems").update({ orgId: ctx.org.id, id: itemId }, { $set: { status: to, [field]: now } });
  await announce(ctx, { id: it.orderId, branchId: it.branchId }, `item.${to}`, ["kitchen", "orders", "display"], { itemId });
}

/** Moves every item of an order to the given status ("bump" a ticket). */
export async function bumpOrder(ctx: Ctx, orderId: string, to: "preparing" | "ready" | "served"): Promise<void> {
  const order = await loadRow(ctx, orderId);
  const from: ItemStatus[] = to === "preparing" ? ["sent"] : to === "ready" ? ["sent", "preparing"] : ["ready"];
  const rows = (await ctx.db.col<ItemDoc>("orderItems").find({ orgId: ctx.org.id, orderId: order.id, status: { $in: from } })).sort(byCreated);
  for (const r of rows) {
    const cur = await ctx.db.col<ItemDoc>("orderItems").findOne({ orgId: ctx.org.id, id: r.id });
    if (cur?.status === "sent" && to !== "preparing") await setItemStatus(ctx, r.id, "preparing");
    await setItemStatus(ctx, r.id, to);
  }
}

export async function voidItem(ctx: Ctx, itemId: string, reason: string): Promise<OrderView> {
  requirePermission(ctx, "orders.void");
  const it = await loadItem(ctx, itemId);
  if (it.orderStatus !== "open") throw new BusinessRuleError(`This order is ${it.orderStatus}.`);
  if (it.status === "void") throw new BusinessRuleError("Already voided.");
  const now = nowIso();
  await ctx.db.col("orderItems").update({ orgId: ctx.org.id, id: itemId }, { $set: { status: "void", voidedAt: now, voidedBy: ctx.userId, voidReason: reason } });
  // Stock only goes back when nothing was cooked yet.
  if (it.status === "sent") await reverseConsumption(ctx, { branchId: it.branchId, orderId: it.orderId, lines: [{ productId: it.productId, qty: Number(it.qty) }] });
  await reprice(ctx, it.orderId);
  await audit(ctx, { action: "order.item_void", entityType: "order", entityId: it.orderId, branchId: it.branchId, summary: `Voided item (${it.status}) — ${reason}` });
  await announce(ctx, { id: it.orderId, branchId: it.branchId }, "item.void", ["orders", "kitchen"], { itemId });
  return getOrder(ctx, it.orderId);
}

export async function voidOrder(ctx: Ctx, orderId: string, reason: string): Promise<OrderView> {
  requirePermission(ctx, "orders.void");
  const order = await loadRow(ctx, orderId);
  assertOpen(order);
  if (Number(order.paidMinor) !== 0) throw new BusinessRuleError("Refund the payments on this order before voiding it.");
  const items = ctx.db.col<ItemDoc>("orderItems");
  const live = (await items.find({ orgId: ctx.org.id, orderId, status: { $ne: "void" } })).sort(byCreated);
  const now = nowIso();
  await items.update({ orgId: ctx.org.id, orderId, status: { $ne: "void" } }, { $set: { status: "void", voidedAt: now, voidedBy: ctx.userId, voidReason: reason } });
  const unmade = live.filter((l) => l.status === "sent").map((l) => ({ productId: l.productId, qty: Number(l.qty) }));
  if (unmade.length) await reverseConsumption(ctx, { branchId: order.branchId, orderId, lines: unmade });
  await reverseLoyaltyForOrder(ctx, orderId);
  await ctx.db.col("orders").update({ orgId: ctx.org.id, id: orderId }, {
    $set: { status: "void", voidedAt: now, voidedBy: ctx.userId, voidReason: reason, subtotalMinor: 0, discountMinor: 0, serviceChargeMinor: 0, taxMinor: 0, totalMinor: 0, updatedAt: now }, $inc: { version: 1 },
  });
  await audit(ctx, { action: "order.void", entityType: "order", entityId: orderId, branchId: order.branchId, summary: `Voided order ${order.number} — ${reason}` });
  await announce(ctx, order, "order.void", ["orders", "kitchen", "display"]);
  return getOrder(ctx, orderId);
}

export async function applyDiscount(ctx: Ctx, orderId: string, d: { kind: "percent" | "amount"; value: number; reason: string } | null): Promise<OrderView> {
  requirePermission(ctx, "orders.discount");
  const order = await loadRow(ctx, orderId);
  assertOpen(order);
  if (d?.kind === "percent" && d.value > 10_000) throw new BusinessRuleError("A discount cannot exceed 100%.");
  await ctx.db.col("orders").update({ orgId: ctx.org.id, id: orderId }, { $set: { discountKind: d?.kind ?? null, discountValue: d?.value ?? null, discountReason: d?.reason ?? null, discountBy: d ? ctx.userId : null } });
  await reprice(ctx, orderId);
  await audit(ctx, { action: d ? "order.discount" : "order.discount_remove", entityType: "order", entityId: orderId, branchId: order.branchId, summary: d ? `Discount on ${order.number}: ${d.kind === "percent" ? `${d.value / 100}%` : d.value} — ${d.reason}` : `Removed discount on ${order.number}` });
  await announce(ctx, order, "order.updated");
  return getOrder(ctx, orderId);
}

export async function setCustomer(ctx: Ctx, orderId: string, customerId: string | null): Promise<OrderView> {
  requirePermission(ctx, "orders.edit");
  const order = await loadRow(ctx, orderId);
  assertOpen(order);
  if (order.rewardId) throw new BusinessRuleError("Remove the loyalty reward before changing the customer.");
  if (customerId) {
    const c = await ctx.db.col("customers").findOne({ orgId: ctx.org.id, id: customerId });
    if (!c) throw new NotFoundError("Customer");
  }
  await ctx.db.col("orders").update({ orgId: ctx.org.id, id: orderId }, { $set: { customerId, updatedAt: nowIso() }, $inc: { version: 1 } });
  await announce(ctx, order, "order.updated");
  return getOrder(ctx, orderId);
}

export async function applyLoyaltyReward(ctx: Ctx, orderId: string, rewardId: string): Promise<OrderView> {
  requirePermission(ctx, "orders.discount");
  const order = await loadRow(ctx, orderId);
  assertOpen(order);
  if (!order.customerId) throw new BusinessRuleError("Attach a customer first.");
  if (order.rewardId) throw new BusinessRuleError("A reward is already applied.");
  const r = await redeemReward(ctx, { orderId, customerId: order.customerId, rewardId, subtotalMinor: Number(order.subtotalMinor) });
  await ctx.db.col("orders").update({ orgId: ctx.org.id, id: orderId }, { $set: { rewardId, rewardPoints: r.pointsCost } });
  await reprice(ctx, orderId);
  await announce(ctx, order, "order.updated");
  return getOrder(ctx, orderId);
}

export async function transferTable(ctx: Ctx, orderId: string, tableId: string): Promise<OrderView> {
  requirePermission(ctx, "orders.edit");
  const order = await loadRow(ctx, orderId);
  assertOpen(order);
  if (order.type !== "dine_in") throw new BusinessRuleError("Only dine-in orders have a table.");
  const t = await ctx.db.col("diningTables").findOne({ orgId: ctx.org.id, branchId: order.branchId, id: tableId, isActive: true });
  if (!t) throw new NotFoundError("Table");
  const taken = await ctx.db.col<OrderDoc>("orders").findOne({ orgId: ctx.org.id, tableId, status: "open", id: { $ne: orderId } });
  if (taken) throw new ConflictError(`That table already has open order ${taken.number}.`);
  await ctx.db.col("orders").update({ orgId: ctx.org.id, id: orderId }, { $set: { tableId, updatedAt: nowIso() }, $inc: { version: 1 } });
  await announce(ctx, order, "order.updated", ["orders", "kitchen"]);
  return getOrder(ctx, orderId);
}

/* ------------------------------------------------------------------ payments */

export async function currentShift(ctx: Ctx, branchId: string, userId = ctx.userId) {
  const s = await ctx.db.col<Doc & { openedAt: string; openingFloatMinor: number }>("shifts").findOne({ orgId: ctx.org.id, branchId, userId, status: "open" }, { sort: { openedAt: -1 } });
  return s ? { id: s.id, openedAt: s.openedAt, openingFloatMinor: Number(s.openingFloatMinor) } : null;
}

export async function pay(ctx: Ctx, orderId: string, input: PayInput): Promise<OrderView> {
  requirePermission(ctx, "payments.collect");
  if (input.method === "paystack") throw new BusinessRuleError("Paystack payments are taken through the Paystack checkout, not entered by hand.");
  return applyPayment(ctx, orderId, input);
}

/** Records a payment against an open order. Callers are responsible for authorisation (the gateway settlement path has none). */
export async function applyPayment(ctx: Ctx, orderId: string, input: PayInput): Promise<OrderView> {
  const order = await loadRow(ctx, orderId);
  assertOpen(order);
  if (!ctx.settings.paymentMethods.includes(input.method)) throw new BusinessRuleError("That payment method is not enabled.");

  if (input.clientKey) {
    const dup = await ctx.db.col("payments").findOne({ orgId: ctx.org.id, clientKey: input.clientKey });
    if (dup) return getOrder(ctx, orderId);
  }
  const liveCount = await ctx.db.col("orderItems").count({ orgId: ctx.org.id, orderId, status: { $ne: "void" } });
  if (!liveCount) throw new BusinessRuleError("Add items before taking payment.");

  const shift = await currentShift(ctx, order.branchId);
  if (input.method === "cash" && ctx.settings.requireShiftForCash && !shift) throw new BusinessRuleError("Open a cash shift before taking cash.");

  const due = Number(order.totalMinor) - Number(order.paidMinor);
  if (due <= 0) throw new BusinessRuleError("This order is already fully paid.");
  const amount = Math.min(input.amountMinor, due);
  if (input.amountMinor > due && input.method !== "cash") throw new BusinessRuleError("Non-cash payments cannot exceed the balance due.");
  const tendered = input.method === "cash" ? Math.max(input.tenderedMinor ?? input.amountMinor, input.amountMinor) : null;
  const change = input.method === "cash" && tendered != null ? changeDue(amount, tendered) : 0;
  if (input.method === "cash" && tendered != null && tendered < amount) throw new BusinessRuleError("Cash tendered is less than the amount.");

  const now = nowIso();
  await ctx.db.col("payments").insert({
    id: newId("payment"), orgId: ctx.org.id, branchId: order.branchId, orderId, shiftId: shift?.id ?? null, method: input.method, amountMinor: amount,
    tenderedMinor: tendered, changeMinor: change, tipMinor: input.tipMinor ?? 0, reference: input.reference ?? null, createdBy: ctx.userId, createdAt: now, clientKey: input.clientKey ?? null,
  });
  const paid = Number(order.paidMinor) + amount;
  const closed = paid >= Number(order.totalMinor);
  await ctx.db.col("orders").update({ orgId: ctx.org.id, id: orderId }, {
    $set: { paidMinor: paid, status: closed ? "closed" : "open", closedAt: closed ? now : null, updatedAt: now }, $inc: { tipMinor: input.tipMinor ?? 0, version: 1 },
  });

  if (closed) {
    // Anything not yet sent goes to the kitchen so a paid order is never lost (counter service).
    const items = ctx.db.col<ItemDoc>("orderItems");
    const held = await items.find({ orgId: ctx.org.id, orderId, status: "held" });
    if (held.length) {
      await items.update({ orgId: ctx.org.id, orderId, status: "held" }, { $set: { status: "sent", round: 1, sentAt: now } });
      await consumeForOrderItems(ctx, { branchId: order.branchId, orderId, lines: held.map((h) => ({ productId: h.productId, qty: Number(h.qty) })) });
    }
    if (order.customerId) await onOrderPaid(ctx, { orderId, customerId: order.customerId, totalMinor: Number(order.totalMinor) });
  }
  await announce(ctx, order, closed ? "order.closed" : "order.paid", closed ? ["orders", "kitchen"] : ["orders"], { amountMinor: amount });
  return getOrder(ctx, orderId);
}

export async function refundPayment(ctx: Ctx, paymentId: string, input: { amountMinor: number; reason: string }): Promise<OrderView> {
  requirePermission(ctx, "payments.refund");
  const payments = ctx.db.col<Doc & { orderId: string; branchId: string; method: string; amountMinor: number; refundOfId: string | null }>("payments");
  const p = await payments.findOne({ orgId: ctx.org.id, id: paymentId });
  if (!p) throw new NotFoundError("Payment");
  requireBranch(ctx, p.branchId);
  if (p.refundOfId || Number(p.amountMinor) < 0) throw new BusinessRuleError("A refund cannot be refunded.");
  const refunded = (await payments.find({ orgId: ctx.org.id, refundOfId: paymentId })).reduce((a, r) => a - Number(r.amountMinor), 0);
  const left = Number(p.amountMinor) - refunded;
  if (input.amountMinor > left) throw new BusinessRuleError(`Only ${left} (minor units) of this payment can still be refunded.`);

  const order = await loadRow(ctx, p.orderId);
  const shift = await currentShift(ctx, p.branchId);
  if (p.method === "cash" && ctx.settings.requireShiftForCash && !shift) throw new BusinessRuleError("Open a cash shift to refund cash.");
  const now = nowIso();
  await payments.insert({
    id: newId("payment"), orgId: ctx.org.id, branchId: p.branchId, orderId: p.orderId, shiftId: shift?.id ?? null, method: p.method, amountMinor: -input.amountMinor,
    refundOfId: paymentId, reason: input.reason, createdBy: ctx.userId, createdAt: now,
  } as never);
  const paid = Number(order.paidMinor) - input.amountMinor;
  await ctx.db.col("orders").update({ orgId: ctx.org.id, id: p.orderId }, { $set: { paidMinor: paid, updatedAt: now }, $inc: { version: 1 } });
  if (paid <= 0) await reverseLoyaltyForOrder(ctx, p.orderId);
  await audit(ctx, { action: "payment.refund", entityType: "order", entityId: p.orderId, branchId: p.branchId, summary: `Refunded ${input.amountMinor} on ${order.number} — ${input.reason}` });
  await announce(ctx, order, "order.refunded");
  return getOrder(ctx, p.orderId);
}

/* ------------------------------------------------------------------ cash shifts */

export interface ShiftSummary {
  id: string; branchId: string; userId: string; userName: string; status: "open" | "closed"; openedAt: string; closedAt: string | null; openingFloatMinor: number;
  cashSalesMinor: number; cashRefundsMinor: number; payInMinor: number; payOutMinor: number; expectedCashMinor: number; countedCashMinor: number | null; varianceMinor: number | null;
  otherSalesMinor: number; orderCount: number; note: string | null;
}

async function summarize(ctx: Ctx, shiftId: string): Promise<ShiftSummary> {
  const s = await ctx.db.col<Doc & { branchId: string; userId: string; status: "open" | "closed"; openedAt: string; closedAt: string | null; openingFloatMinor: number; countedCashMinor: number | null; varianceMinor: number | null; note: string | null }>("shifts").findOne({ orgId: ctx.org.id, id: shiftId });
  if (!s) throw new NotFoundError("Shift");
  requireBranch(ctx, s.branchId);
  const user = await ctx.db.col<Doc & { name: string }>("users").findOne({ orgId: ctx.org.id, id: s.userId });
  const pays = await ctx.db.col<Doc & { method: string; amountMinor: number; orderId: string }>("payments").find({ orgId: ctx.org.id, shiftId });
  let cashIn = 0, cashOut = 0, other = 0;
  for (const p of pays) {
    const a = Number(p.amountMinor);
    if (p.method === "cash") { if (a > 0) cashIn += a; else cashOut += -a; } else other += a;
  }
  const orders = new Set(pays.map((p) => p.orderId)).size;
  const moves = await ctx.db.col<Doc & { type: string; amountMinor: number }>("cashMovements").find({ orgId: ctx.org.id, shiftId });
  const payIn = moves.filter((m) => m.type === "pay_in").reduce((a, m) => a + Number(m.amountMinor), 0);
  const payOut = moves.filter((m) => m.type === "pay_out").reduce((a, m) => a + Number(m.amountMinor), 0);
  const expected = Number(s.openingFloatMinor) + cashIn - cashOut + payIn - payOut;
  return {
    id: s.id, branchId: s.branchId, userId: s.userId, userName: user?.name ?? "", status: s.status, openedAt: s.openedAt, closedAt: s.closedAt ?? null, openingFloatMinor: Number(s.openingFloatMinor),
    cashSalesMinor: cashIn, cashRefundsMinor: cashOut, payInMinor: payIn, payOutMinor: payOut, expectedCashMinor: expected,
    countedCashMinor: s.countedCashMinor == null ? null : Number(s.countedCashMinor), varianceMinor: s.varianceMinor == null ? null : Number(s.varianceMinor),
    otherSalesMinor: other, orderCount: orders, note: s.note ?? null,
  };
}

export async function openShift(ctx: Ctx, input: { branchId: string; openingFloatMinor: number }): Promise<ShiftSummary> {
  requirePermission(ctx, "shifts.manage");
  requireBranch(ctx, input.branchId);
  if (await currentShift(ctx, input.branchId)) throw new BusinessRuleError("You already have an open shift here.");
  const id = newId("shift");
  await ctx.db.col("shifts").insert({ id, orgId: ctx.org.id, branchId: input.branchId, userId: ctx.userId, terminalId: ctx.terminalId, status: "open", openedAt: nowIso(), openingFloatMinor: input.openingFloatMinor });
  await audit(ctx, { action: "shift.open", entityType: "shift", entityId: id, branchId: input.branchId, summary: `Opened shift with float ${input.openingFloatMinor}` });
  return summarize(ctx, id);
}

export async function recordCashMovement(ctx: Ctx, input: { shiftId: string; type: "pay_in" | "pay_out"; amountMinor: number; reason: string }): Promise<ShiftSummary> {
  requirePermission(ctx, "shifts.manage");
  const s = await summarize(ctx, input.shiftId);
  if (s.status !== "open") throw new BusinessRuleError("This shift is closed.");
  if (s.userId !== ctx.userId) throw new BusinessRuleError("You can only record movements on your own shift.");
  if (input.type === "pay_out" && input.amountMinor > s.expectedCashMinor) throw new BusinessRuleError("Pay-out is more than the cash expected in the drawer.");
  await ctx.db.col("cashMovements").insert({ id: newId("cashMove"), orgId: ctx.org.id, shiftId: input.shiftId, type: input.type, amountMinor: input.amountMinor, reason: input.reason, createdBy: ctx.userId, createdAt: nowIso() });
  return summarize(ctx, input.shiftId);
}

export async function closeShift(ctx: Ctx, input: { shiftId: string; countedCashMinor: number; note?: string | null }): Promise<ShiftSummary> {
  requirePermission(ctx, "shifts.manage");
  const s = await summarize(ctx, input.shiftId);
  if (s.status !== "open") throw new BusinessRuleError("This shift is already closed.");
  if (s.userId !== ctx.userId && !ctx.permissions.has("shifts.view_all")) throw new BusinessRuleError("Only the cashier or a manager can close this shift.");
  const variance = input.countedCashMinor - s.expectedCashMinor;
  await ctx.db.col("shifts").update({ orgId: ctx.org.id, id: input.shiftId }, { $set: { status: "closed", closedAt: nowIso(), closedBy: ctx.userId, expectedCashMinor: s.expectedCashMinor, countedCashMinor: input.countedCashMinor, varianceMinor: variance, note: input.note ?? null } });
  await audit(ctx, { action: "shift.close", entityType: "shift", entityId: input.shiftId, branchId: s.branchId, summary: `Closed shift: expected ${s.expectedCashMinor}, counted ${input.countedCashMinor}, variance ${variance}` });
  return summarize(ctx, input.shiftId);
}

export async function listShifts(ctx: Ctx, opts: { branchId?: string; limit?: number } = {}): Promise<ShiftSummary[]> {
  requirePermission(ctx, "shifts.manage");
  const all = ctx.permissions.has("shifts.view_all");
  const branchIds = opts.branchId ? [requireBranch(ctx, opts.branchId).id] : ctx.branches.map((b) => b.id);
  if (!branchIds.length) return [];
  const rows = await ctx.db.col("shifts").find({ orgId: ctx.org.id, branchId: { $in: branchIds }, ...(all ? {} : { userId: ctx.userId }) }, { sort: { openedAt: -1, id: -1 }, limit: Math.min(opts.limit ?? 50, 200) });
  return Promise.all(rows.map((r) => summarize(ctx, r.id)));
}

export const getShift = (ctx: Ctx, shiftId: string) => summarize(ctx, shiftId);

/* ------------------------------------------------------------------ floor & lookups */

export interface TableState { id: string; label: string; seats: number; areaName: string | null; orderId: string | null; orderNumber: string | null; totalMinor: number; openedAt: string | null }
export async function listTables(ctx: Ctx, branchId: string): Promise<TableState[]> {
  requirePermission(ctx, "orders.view");
  requireBranch(ctx, branchId);
  const org = ctx.org.id;
  const [tables, areas, open] = await Promise.all([
    ctx.db.col<Doc & { label: string; seats: number; areaId: string | null; sortOrder: number }>("diningTables").find({ orgId: org, branchId, isActive: true }),
    ctx.db.col<Doc & { name: string; sortOrder: number }>("floorAreas").find({ orgId: org, branchId }),
    ctx.db.col<OrderDoc>("orders").find({ orgId: org, branchId, status: "open", tableId: { $type: "string" } }),
  ]);
  const area = new Map(areas.map((a) => [a.id, a]));
  const byTable = new Map(open.map((o) => [o.tableId!, o]));
  return tables
    .sort((a, b) => Number(area.get(a.areaId ?? "")?.sortOrder ?? 0) - Number(area.get(b.areaId ?? "")?.sortOrder ?? 0) || Number(a.sortOrder) - Number(b.sortOrder) || a.label.localeCompare(b.label))
    .map((t) => { const o = byTable.get(t.id); return { id: t.id, label: t.label, seats: Number(t.seats), areaName: t.areaId ? area.get(t.areaId)?.name ?? null : null, orderId: o?.id ?? null, orderNumber: o?.number ?? null, totalMinor: Number(o?.totalMinor ?? 0), openedAt: o?.openedAt ?? null }; });
}

export async function listActiveRewards(ctx: Ctx): Promise<{ id: string; name: string; pointsCost: number }[]> {
  if (!ctx.settings.loyaltyEnabled) return [];
  const rows = await ctx.db.col<Doc & { name: string; pointsCost: number }>("loyaltyRewards").find({ orgId: ctx.org.id, isActive: true }, { sort: { pointsCost: 1, name: 1 } });
  return rows.map((r) => ({ id: r.id, name: r.name, pointsCost: Number(r.pointsCost) }));
}

/* ------------------------------------------------------------------ kitchen board */

export interface KitchenTicket {
  orderId: string; number: string; type: string; tableLabel: string | null; customerName: string | null; sentAt: string; notes: string | null;
  items: { id: string; name: string; variantName: string | null; qty: number; note: string | null; status: ItemStatus; round: number; modifiers: string[] }[];
}
/** Tickets with unfinished kitchen work (and recently ready items), oldest first. */
export async function getKitchenBoard(ctx: Ctx, branchId: string, stationId?: string | null): Promise<KitchenTicket[]> {
  requirePermission(ctx, "kitchen.view");
  requireBranch(ctx, branchId);
  const org = ctx.org.id;
  const openOrders = await hydrate(ctx, await ctx.db.col<OrderDoc>("orders").find({ orgId: org, branchId, status: "open" }));
  if (!openOrders.length) return [];
  const orderById = new Map(openOrders.map((o) => [o.id, o]));
  const rows = (await ctx.db.col<ItemDoc>("orderItems").find({ orgId: org, orderId: { $in: [...orderById.keys()] }, status: { $in: ["sent", "preparing", "ready"] }, ...(stationId ? { stationId } : {}) }))
    .sort((a, b) => ((a.sentAt ?? "") < (b.sentAt ?? "") ? -1 : (a.sentAt ?? "") > (b.sentAt ?? "") ? 1 : a.id < b.id ? -1 : 1));
  const mods = rows.length ? await ctx.db.col<Doc & { orderItemId: string; name: string }>("orderItemModifiers").find({ orgId: org, orderItemId: { $in: rows.map((r) => r.id) } }, { sort: { id: 1 } }) : [];
  const byItem = new Map<string, string[]>();
  for (const m of mods) (byItem.get(m.orderItemId) ?? byItem.set(m.orderItemId, []).get(m.orderItemId)!).push(m.name);
  const tickets = new Map<string, KitchenTicket>();
  for (const r of rows) {
    const o = orderById.get(r.orderId)!;
    const t = tickets.get(r.orderId) ?? { orderId: r.orderId, number: o.number, type: o.type, tableLabel: o.tableLabel, customerName: o.customerName, sentAt: r.sentAt ?? "", notes: o.notes ?? null, items: [] };
    t.items.push({ id: r.id, name: r.name, variantName: r.variantName ?? null, qty: Number(r.qty), note: r.note ?? null, status: r.status, round: Number(r.round), modifiers: byItem.get(r.id) ?? [] });
    tickets.set(r.orderId, t);
  }
  return [...tickets.values()];
}
