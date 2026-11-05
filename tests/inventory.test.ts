import test from "node:test";
import assert from "node:assert/strict";
import { createTenant } from "./helpers";
import * as inv from "@/modules/inventory/service";
import { itemSchema, movementSchema } from "@/modules/inventory/schema";
import * as orders from "@/modules/orders/service";
import { saveCategory, saveProduct } from "@/modules/menu/service";

test("stock: opening, receive, waste, recipe consumption on send, reversal on void, PO receiving", async () => {
  const t = await createTenant();
  const c = t.owner;
  const flour = await inv.saveItem(c, itemSchema.parse({ name: "Flour", unit: "g", displayUnit: "kg", branchId: t.branchId, reorderQty: "2", openingQty: "10", openingCostMinor: "100000" }));
  let rows = await inv.listStock(c, t.branchId);
  assert.equal(rows[0]!.qtyMilli, 10_000_000); assert.equal(rows[0]!.valueMinor, 100000); assert.equal(rows[0]!.costPerUnit, 10000);

  await inv.recordMovement(c, movementSchema.parse({ branchId: t.branchId, itemId: flour.id, kind: "receive", displayUnit: "kg", qty: "10", totalCostMinor: "140000" }));
  rows = await inv.listStock(c, t.branchId);
  assert.equal(rows[0]!.qtyMilli, 20_000_000); assert.equal(rows[0]!.valueMinor, 240000);
  await assert.rejects(() => inv.recordMovement(c, movementSchema.parse({ branchId: t.branchId, itemId: flour.id, kind: "waste", displayUnit: "kg", qty: "1" })), /reason/);
  await inv.recordMovement(c, movementSchema.parse({ branchId: t.branchId, itemId: flour.id, kind: "waste", displayUnit: "kg", qty: "1", reason: "Spilled" }));

  const cat = await saveCategory(c, { name: "Bakery", color: "#4338ca", sortOrder: 0, isActive: true } as never);
  const bread = await saveProduct(c, { name: "Bread", categoryId: cat.id, basePriceMinor: 5000, isActive: true, isTaxExempt: false, prepMinutes: 5, sortOrder: 0, description: "", variants: [], modifierGroupIds: [] } as never);
  await inv.setRecipe(c, bread.id, [{ itemId: flour.id, qtyMilli: 500_000 }]); // 500 g per loaf
  const o = await orders.openOrder(c, { branchId: t.branchId, type: "takeaway" });
  const w = await orders.addItems(c, o.id, [{ productId: bread.id, qty: 4 }]);
  await orders.sendToKitchen(c, o.id);
  assert.equal((await inv.listStock(c, t.branchId))[0]!.qtyMilli, 19_000_000 - 2_000_000);
  await orders.voidItem(c, w.items[0]!.id, "Cancelled");
  assert.equal((await inv.listStock(c, t.branchId))[0]!.qtyMilli, 19_000_000, "stock returns when voided before cooking");
  await assert.rejects(() => inv.archiveItem(c, flour.id), /recipe/);

  const sup = await inv.saveSupplier(c, { name: "Unga Ltd" } as never);
  const po = await inv.savePurchaseOrder(c, { branchId: t.branchId, supplierId: sup.id, lines: [{ itemId: flour.id, qtyMilli: 5_000_000, lineTotalMinor: 60000 }] } as never);
  await assert.rejects(() => inv.receivePo(c, { id: po.id, lines: [] } as never), /sent/);
  await inv.markOrdered(c, po.id);
  const [row] = await inv.listPurchaseOrders(c, t.branchId);
  assert.equal(row!.number, "PO-0001");
  assert.equal((await inv.receivePo(c, { id: po.id, lines: [{ lineId: row!.lines[0]!.id, qtyMilli: 2_000_000, totalMinor: 24000 }] })).status, "partial");
  assert.equal((await inv.receivePo(c, { id: po.id, lines: [{ lineId: row!.lines[0]!.id, qtyMilli: 3_000_000, totalMinor: 36000 }] })).status, "received");
  assert.equal((await inv.listStock(c, t.branchId))[0]!.qtyMilli, 24_000_000);
  assert.ok((await inv.listMovements(c, t.branchId, flour.id)).length >= 6);
});
