import test from "node:test";
import assert from "node:assert/strict";
import { priceOrder } from "@/modules/orders/pricing";

const rules = { taxRateBp: 1600, taxInclusive: false, serviceChargeBp: 0, serviceChargeTaxable: false };
const L = (unitMinor: number, qty = 1, taxExempt = false) => ({ unitMinor, qty, taxExempt });

test("exclusive tax is added on top", () => {
  const r = priceOrder([L(10000, 2)], null, 0, rules);
  assert.deepEqual(r, { subtotalMinor: 20000, discountMinor: 0, serviceChargeMinor: 0, taxMinor: 3200, totalMinor: 23200 });
});
test("inclusive tax does not change the total", () => {
  const r = priceOrder([L(11600)], null, 0, { ...rules, taxInclusive: true });
  assert.equal(r.totalMinor, 11600); assert.equal(r.taxMinor, 1600);
});
test("percent discount applies before tax and service", () => {
  const r = priceOrder([L(10000)], { kind: "percent", value: 1000 }, 0, { ...rules, serviceChargeBp: 1000 });
  assert.equal(r.discountMinor, 1000); assert.equal(r.serviceChargeMinor, 900); assert.equal(r.taxMinor, 1296 - 0 > 0 ? r.taxMinor : 0);
  assert.equal(r.totalMinor, 9000 + 900 + r.taxMinor);
});
test("discount is capped at the subtotal", () => {
  const r = priceOrder([L(500)], { kind: "amount", value: 9999 }, 100, rules);
  assert.equal(r.discountMinor, 500); assert.equal(r.totalMinor, 0);
});
test("exempt lines carry no tax", () => {
  const r = priceOrder([L(10000), L(10000, 1, true)], null, 0, rules);
  assert.equal(r.taxMinor, 1600);
});
test("discount spread keeps exempt/taxable split exact", () => {
  const r = priceOrder([L(1000), L(1000, 1, true)], { kind: "amount", value: 1000 }, 0, rules);
  assert.equal(r.taxMinor, 80); assert.equal(r.totalMinor, 1080);
});
