import test from "node:test";
import assert from "node:assert/strict";
import { createTenant } from "./helpers";
import { newId } from "@/platform/ids";
import * as orders from "@/modules/orders/service";
import { saveProduct, saveCategory } from "@/modules/menu/service";

async function setup() {
  const t = await createTenant();
  const cat = await saveCategory(t.owner, { name: "Mains", color: "#4338ca", sortOrder: 0, isActive: true } as never);
  const mk = (name: string, price: number) => saveProduct(t.owner, { name, categoryId: cat.id, basePriceMinor: price, isActive: true, isTaxExempt: false, prepMinutes: 5, sortOrder: 0, description: "", variants: [], modifierGroupIds: [] } as never);
  const burger = await mk("Burger", 100000);
  const tea = await mk("Tea", 20000);
  await t.db.col("orgSettings").update({ id: t.orgId }, { $set: { taxRateBp: 1600, taxInclusive: false, serviceChargeBp: 0 } });
  const owner = await t.ctxFor(t.ownerId);
  return { t, ctx: owner, burger, tea };
}

test("order lifecycle: open → add → send → pay closes order", async () => {
  const { t, ctx, burger, tea } = await setup();
  const o = await orders.openOrder(ctx, { branchId: t.branchId, type: "takeaway", clientKey: "k1" });
  assert.equal((await orders.openOrder(ctx, { branchId: t.branchId, type: "takeaway", clientKey: "k1" })).id, o.id, "idempotent");
  const o2 = await orders.addItems(ctx, o.id, [{ productId: burger.id, qty: 2 }, { productId: tea.id, qty: 1 }]);
  assert.equal(o2.subtotalMinor, 220000); assert.equal(o2.taxMinor, 35200); assert.equal(o2.totalMinor, 255200);
  const sent = await orders.sendToKitchen(ctx, o.id);
  assert.ok(sent.items.every((i) => i.status === "sent" && i.round === 1));
  await orders.openShift(ctx, { branchId: t.branchId, openingFloatMinor: 50000 });
  const part = await orders.pay(ctx, o.id, { orderId: o.id, method: "cash", amountMinor: 100000, tenderedMinor: 100000 });
  assert.equal(part.status, "open"); assert.equal(part.paidMinor, 100000);
  const done = await orders.pay(ctx, o.id, { orderId: o.id, method: "cash", amountMinor: 155200, tenderedMinor: 200000 });
  assert.equal(done.status, "closed"); assert.equal(done.payments[1]!.changeMinor, 44800);
  await assert.rejects(() => orders.pay(ctx, o.id, { orderId: o.id, method: "cash", amountMinor: 1 }), /not open|closed/i);
});

test("void rules, discount audit and refunds", async () => {
  const { t, ctx, burger } = await setup();
  const o = await orders.openOrder(ctx, { branchId: t.branchId, type: "takeaway" });
  const a = await orders.addItems(ctx, o.id, [{ productId: burger.id, qty: 1 }]);
  const d = await orders.applyDiscount(ctx, o.id, { kind: "percent", value: 1000, reason: "Staff" });
  assert.equal(d.discountMinor, 10000); assert.equal(d.totalMinor, 104400);
  await orders.sendToKitchen(ctx, o.id);
  await assert.rejects(() => orders.removeHeldItem(ctx, a.items[0]!.id), /already sent/);
  const v = await orders.voidItem(ctx, a.items[0]!.id, "Wrong dish");
  assert.equal(v.totalMinor, 0);
  const audits = await t.db.col("auditLogs").find({ orgId: t.orgId }, { sort: { createdAt: 1 } });
  assert.ok((audits as unknown as { action: string }[]).some((r) => r.action === "order.item_void"));

  const o2 = await orders.openOrder(ctx, { branchId: t.branchId, type: "takeaway" });
  await orders.addItems(ctx, o2.id, [{ productId: burger.id, qty: 1 }]);
  await orders.openShift(ctx, { branchId: t.branchId, openingFloatMinor: 0 });
  const paid = await orders.pay(ctx, o2.id, { orderId: o2.id, method: "card", amountMinor: 116000 });
  assert.equal(paid.status, "closed");
  await assert.rejects(() => orders.voidOrder(ctx, o2.id, "x"), /not open|closed|Refund/i);
  const r = await orders.refundPayment(ctx, paid.payments[0]!.id, { amountMinor: 116000, reason: "Complaint" });
  assert.equal(r.paidMinor, 0);
  await assert.rejects(() => orders.refundPayment(ctx, paid.payments[0]!.id, { amountMinor: 1, reason: "again" }), /can still be refunded/);
});

test("table is exclusive and shift variance is computed", async () => {
  const { t, ctx, burger } = await setup();
  const tbl = newId("table");
  await assert.rejects(() => orders.openOrder(ctx, { branchId: t.branchId, type: "dine_in" }), /Select a table/i);
  await t.db.col("diningTables").insert({ id: tbl, orgId: t.orgId, branchId: t.branchId, label: "T1", seats: 4, sortOrder: 0, isActive: true });
  await orders.openOrder(ctx, { branchId: t.branchId, type: "dine_in", tableId: tbl });
  await assert.rejects(() => orders.openOrder(ctx, { branchId: t.branchId, type: "dine_in", tableId: tbl }), /already has open order/);

  const sh = await orders.openShift(ctx, { branchId: t.branchId, openingFloatMinor: 10000 });
  const o = await orders.openOrder(ctx, { branchId: t.branchId, type: "takeaway" });
  await orders.addItems(ctx, o.id, [{ productId: burger.id, qty: 1 }]);
  await orders.pay(ctx, o.id, { orderId: o.id, method: "cash", amountMinor: 116000, tenderedMinor: 120000 });
  await orders.recordCashMovement(ctx, { shiftId: sh.id, type: "pay_out", amountMinor: 5000, reason: "Ice" });
  const closed = await orders.closeShift(ctx, { shiftId: sh.id, countedCashMinor: 120000 });
  assert.equal(closed.expectedCashMinor, 121000); assert.equal(closed.varianceMinor, -1000);
});

test("loyalty reward follows the basket and points are earned on close", async () => {
  const { t, ctx, burger } = await setup();
  await t.db.col("orgSettings").update({ id: t.orgId }, { $set: { loyaltyEnabled: true, loyaltyEarnPointsPer100: 10 } });
  const c2 = await t.ctxFor(t.ownerId);
  const cid = newId("customer"); const rid = newId("reward");
  await t.db.col("customers").insert({ id: cid, orgId: t.orgId, name: "Wanjiru", phone: "+254712345678", pointsBalance: 200, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await t.db.col("loyaltyRewards").insert({ id: rid, orgId: t.orgId, name: "10% off", pointsCost: 100, kind: "percent_off", value: 1000, createdAt: new Date().toISOString() });
  const o = await orders.openOrder(c2, { branchId: t.branchId, type: "takeaway", customerId: cid });
  await orders.addItems(c2, o.id, [{ productId: burger.id, qty: 1 }]);
  const r = await orders.applyLoyaltyReward(c2, o.id, rid);
  assert.equal(r.rewardDiscountMinor, 10000); assert.equal(r.discountMinor, 10000);
  const more = await orders.addItems(c2, o.id, [{ productId: burger.id, qty: 1 }]);
  assert.equal(more.rewardDiscountMinor, 20000);
  await orders.openShift(c2, { branchId: t.branchId, openingFloatMinor: 0 });
  const done = await orders.pay(c2, o.id, { orderId: o.id, method: "card", amountMinor: more.totalMinor });
  assert.equal(done.status, "closed");
  const bal = await t.db.col<{ id: string; pointsBalance: number }>("customers").findOne({ id: cid });
  assert.ok(Number(bal!.pointsBalance) > 100);
});

test("kitchen board lists sent items and bump flow reaches served", async () => {
  const { t, ctx, burger, tea } = await setup();
  const o = await orders.openOrder(ctx, { branchId: t.branchId, type: "takeaway" });
  await orders.addItems(ctx, o.id, [{ productId: burger.id, qty: 1 }, { productId: tea.id, qty: 2 }]);
  assert.equal((await orders.getKitchenBoard(ctx, t.branchId)).length, 0, "held items are not on the board");
  await orders.sendToKitchen(ctx, o.id);
  const board = await orders.getKitchenBoard(ctx, t.branchId);
  assert.equal(board.length, 1); assert.equal(board[0]!.items.length, 2);
  await orders.bumpOrder(ctx, o.id, "ready");
  assert.ok((await orders.getKitchenBoard(ctx, t.branchId))[0]!.items.every((i) => i.status === "ready"));
  await orders.bumpOrder(ctx, o.id, "served");
  assert.equal((await orders.getKitchenBoard(ctx, t.branchId)).length, 0);
  await assert.rejects(() => orders.setItemStatus(ctx, board[0]!.items[0]!.id, "preparing"), /cannot become/);
});
