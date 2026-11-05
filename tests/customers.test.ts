import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTenant } from "./helpers";
import { normalisePhone } from "@/modules/customers/phone";
import * as svc from "@/modules/customers/service";
import * as loy from "@/modules/customers/loyalty";

async function setup(opts: { enabled?: boolean; rate?: number } = {}) {
  const t = await createTenant();
  let ctx = t.owner;
  await svc.saveLoyaltySettings(ctx, { enabled: opts.enabled ?? true, earnPointsPer100: opts.rate ?? 1, pointValueMinor: 100 });
  ctx = await t.ctxFor(t.ownerId);
  const { id } = await svc.saveCustomer(ctx, { name: "Wanjiru", phone: "0712345678", isActive: true } as never);
  return { t, ctx, id };
}

describe("phone normalisation", () => {
  it("normalises Kenyan formats", () => {
    for (const v of ["0712345678", "+254712345678", "254712345678", "712345678", "0712 345 678", "0712-345-678"]) assert.equal(normalisePhone(v), "+254712345678", v);
  });
  it("keeps international numbers and rejects junk", () => {
    assert.equal(normalisePhone("+14155552671"), "+14155552671");
    assert.equal(normalisePhone("abc"), null);
    assert.equal(normalisePhone("123"), null);
    assert.equal(normalisePhone("25471234"), null);
  });
});

describe("loyalty earn", () => {
  it("rounds down using currency fraction digits", () => {
    assert.equal(loy.pointsForTotal(123456, 1, "KES"), 12);
    assert.equal(loy.pointsForTotal(99999, 1, "KES"), 9);
    assert.equal(loy.pointsForTotal(10000, 5, "KES"), 5);
    assert.equal(loy.pointsForTotal(0, 5, "KES"), 0);
    assert.equal(loy.pointsForTotal(5000, 1, "UGX"), 50);
  });
  it("is idempotent per order and updates stats", async () => {
    const { ctx, id } = await setup();
    const a = await loy.onOrderPaid(ctx, { orderId: "ord_1", customerId: id, totalMinor: 123456 });
    const b = await loy.onOrderPaid(ctx, { orderId: "ord_1", customerId: id, totalMinor: 123456 });
    assert.equal(a.pointsEarned, 12);
    assert.equal(b.pointsEarned, 0);
    const p = await svc.getCustomerProfile(ctx, id);
    assert.equal(p.customer.pointsBalance, 12);
    assert.equal(p.customer.visits, 1);
    assert.equal(p.customer.lifetimeSpendMinor, 123456);
    assert.equal(p.ledger.length, 1);
  });
  it("records the visit but no points when loyalty is disabled", async () => {
    const { ctx, id } = await setup({ enabled: false });
    const r = await loy.onOrderPaid(ctx, { orderId: "ord_1", customerId: id, totalMinor: 500000 });
    assert.equal(r.pointsEarned, 0);
    const p = await svc.getCustomerProfile(ctx, id);
    assert.equal(p.customer.visits, 1);
    assert.equal(p.customer.pointsBalance, 0);
  });
});

describe("rewards", () => {
  it("previews and redeems, refusing insufficient balance", async () => {
    const { ctx, id } = await setup();
    const { id: rewardId } = await svc.saveReward(ctx, { name: "KSh 200 off", pointsCost: 50, kind: "amount_off", value: 20000, isActive: true });
    await assert.rejects(loy.previewReward(ctx, { customerId: id, rewardId, subtotalMinor: 100000 }), /Not enough/);
    await assert.rejects(loy.redeemReward(ctx, { orderId: "ord_0", customerId: id, rewardId, subtotalMinor: 100000 }), /Not enough/);
    await svc.adjustPoints(ctx, { customerId: id, points: 80, reason: "seed" });
    const pv = await loy.previewReward(ctx, { customerId: id, rewardId, subtotalMinor: 100000 });
    assert.deepEqual(pv, { pointsCost: 50, discountMinor: 20000, rewardName: "KSh 200 off" });
    const r1 = await loy.redeemReward(ctx, { orderId: "ord_2", customerId: id, rewardId, subtotalMinor: 100000 });
    const r2 = await loy.redeemReward(ctx, { orderId: "ord_2", customerId: id, rewardId, subtotalMinor: 100000 });
    assert.equal(r1.pointsCost, 50);
    assert.equal(r2.pointsCost, 50);
    assert.equal((await svc.getCustomerProfile(ctx, id)).customer.pointsBalance, 30);
  });
  it("caps discounts at the subtotal and supports percent rewards", async () => {
    assert.equal(loy.rewardDiscount({ kind: "amount_off", value: 50000 }, 30000), 30000);
    assert.equal(loy.rewardDiscount({ kind: "percent_off", value: 1000 }, 123400), 12340);
  });
  it("reverses earn and redeem for an order and is idempotent", async () => {
    const { ctx, id } = await setup();
    await svc.adjustPoints(ctx, { customerId: id, points: 100, reason: "seed" });
    const { id: rewardId } = await svc.saveReward(ctx, { name: "Off", pointsCost: 40, kind: "amount_off", value: 10000, isActive: true });
    await loy.redeemReward(ctx, { orderId: "ord_3", customerId: id, rewardId, subtotalMinor: 200000 });
    await loy.onOrderPaid(ctx, { orderId: "ord_3", customerId: id, totalMinor: 200000 });
    assert.equal((await svc.getCustomerProfile(ctx, id)).customer.pointsBalance, 100 - 40 + 20);
    await loy.reverseLoyaltyForOrder(ctx, "ord_3");
    await loy.reverseLoyaltyForOrder(ctx, "ord_3");
    const c = (await svc.getCustomerProfile(ctx, id)).customer;
    assert.equal(c.pointsBalance, 100);
    assert.equal(c.visits, 0);
  });
});

describe("customers", () => {
  it("enforces unique phone per org after normalisation", async () => {
    const { ctx } = await setup();
    await assert.rejects(svc.saveCustomer(ctx, { name: "Dup", phone: "+254 712 345 678", isActive: true } as never), /already/i);
  });
  it("refuses to adjust points below zero", async () => {
    const { ctx, id } = await setup();
    await assert.rejects(svc.adjustPoints(ctx, { customerId: id, points: -5, reason: "oops" }), (e: any) => e.name === "ValidationError" && /below zero|negative|enough/i.test(JSON.stringify(e.fieldErrors ?? e.message)));
  });
  it("searches by name and phone", async () => {
    const { ctx, id } = await setup();
    assert.equal((await loy.searchCustomers(ctx, "wanj"))[0]?.id, id);
    assert.equal((await loy.searchCustomers(ctx, "0712345"))[0]?.id, id);
    assert.deepEqual(await loy.searchCustomers(ctx, "zzz"), []);
    const list = await svc.listCustomers(ctx, { q: "712345" });
    assert.equal(list.total, 1);
  });
  it("isolates tenants", async () => {
    const a = await setup();
    const b = await createTenant();
    await assert.rejects(svc.getCustomerProfile(b.owner, a.id));
    await assert.rejects(loy.onOrderPaid(b.owner, { orderId: "o", customerId: a.id, totalMinor: 1000 }));
    assert.deepEqual(await loy.searchCustomers(b.owner, "wanj"), []);
    assert.equal((await svc.listCustomers(b.owner)).total, 0);
  });
});
