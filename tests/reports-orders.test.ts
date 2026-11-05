import test from "node:test";
import assert from "node:assert/strict";
import { createTenant } from "./helpers";
import * as orders from "@/modules/orders/service";
import * as rep from "@/modules/reports/service";
import { parseRange } from "@/modules/reports/range";
import { reportRows, REPORT_KEYS } from "@/modules/reports/exports";
import { saveCategory, saveProduct } from "@/modules/menu/service";

test("reports aggregate real orders and every CSV renders", async () => {
  const t = await createTenant();
  const ctx = t.owner;
  const cat = await saveCategory(ctx, { name: "Mains", color: "#4338ca", sortOrder: 0, isActive: true } as never);
  const p = await saveProduct(ctx, { name: "Burger", categoryId: cat.id, basePriceMinor: 100000, isActive: true, isTaxExempt: false, prepMinutes: 5, sortOrder: 0, description: "", variants: [], modifierGroupIds: [] } as never);
  await t.db.col("orgSettings").update({ id: t.orgId }, { $set: { taxRateBp: 1600, taxInclusive: false, serviceChargeBp: 0 } });
  const c = await t.ctxFor(t.ownerId);
  await orders.openShift(c, { branchId: t.branchId, openingFloatMinor: 0 });
  for (const method of ["cash", "card"] as const) {
    const o = await orders.openOrder(c, { branchId: t.branchId, type: "takeaway" });
    await orders.addItems(c, o.id, [{ productId: p.id, qty: 2 }]);
    await orders.pay(c, o.id, { orderId: o.id, method, amountMinor: 232000 });
  }
  const v = await orders.openOrder(c, { branchId: t.branchId, type: "takeaway" });
  await orders.addItems(c, v.id, [{ productId: p.id, qty: 1 }]);
  await orders.voidOrder(c, v.id, "Walked out");

  const scope = rep.resolveScope(c, null);
  const range = parseRange({ preset: "today" }, scope.timezone);
  const s = await rep.getSalesSummary(c, scope, range);
  assert.equal(s.orders, 2); assert.equal(s.revenueMinor, 464000); assert.equal(s.voidOrders, 1); assert.equal(s.taxMinor, 64000);
  const prod = await rep.getProductSales(c, scope, range);
  assert.equal(prod.products[0]!.qty, 4);
  const dash = await rep.getDashboard(c, null);
  assert.equal(dash.now.orders, 2); assert.equal(dash.payments.length, 2);
  for (const k of REPORT_KEYS) assert.ok((await reportRows(c, k, scope, range)).length >= 1, k);
});
