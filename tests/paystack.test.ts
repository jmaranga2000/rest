import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createTenant } from "./helpers";
import { __setEnvForTests } from "@/platform/env";
import { decryptSecret, encryptSecret } from "@/platform/crypto";
import { __setPaystackFetchForTests, verifyWebhookSignature } from "@/platform/paystack/client";
import * as orders from "@/modules/orders/service";
import { saveCategory, saveProduct } from "@/modules/menu/service";
import * as pay from "@/modules/payments/service";
import * as admin from "@/modules/admin/service";

const SK = "sk_test_abcdefgh12345678";
const PK = "pk_test_abcdefgh12345678";
const PLATFORM_SK = "sk_live_platformKEY123456";

/** Fake Paystack: records calls; `paid` controls what /verify answers. */
function fakePaystack() {
  const state = { calls: [] as { path: string; key: string; body?: Record<string, unknown> }[], verify: new Map<string, { status: string; amount: number; currency: string }>() };
  __setPaystackFetchForTests(async (url, init) => {
    const path = url.replace("https://api.paystack.co", "");
    const key = (init.headers.Authorization ?? "").replace("Bearer ", "");
    const body = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    state.calls.push({ path, key, body });
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ status: true, message: "ok", data }) });
    if (path === "/transaction/initialize") return ok({ authorization_url: `https://checkout.paystack.com/${body!.reference}`, access_code: "ac", reference: body!.reference });
    if (path.startsWith("/transaction/verify/")) {
      const ref = decodeURIComponent(path.split("/").pop()!);
      const v = state.verify.get(ref) ?? { status: "abandoned", amount: 0, currency: "KES" };
      return ok({ reference: ref, ...v });
    }
    if (path === "/balance") return key === SK ? ok([]) : { ok: false, status: 401, json: async () => ({ status: false, message: "Invalid key" }) };
    return { ok: false, status: 404, json: async () => ({ status: false, message: "nope" }) };
  });
  return state;
}
afterEach(() => { __setPaystackFetchForTests(null); __setEnvForTests({}); });

async function setup() {
  __setEnvForTests({ APP_URL: "https://pos.example.com" });
  const ps = fakePaystack();
  const t = await createTenant();
  const cat = await saveCategory(t.owner, { name: "Mains", color: "#4338ca", sortOrder: 0, isActive: true } as never);
  const burger = await saveProduct(t.owner, { name: "Burger", categoryId: cat.id, basePriceMinor: 100000, isActive: true, isTaxExempt: false, prepMinutes: 5, sortOrder: 0, description: "", variants: [], modifierGroupIds: [] } as never);
  await t.db.col("orgSettings").update({ id: t.orgId }, { $set: { taxRateBp: 0, serviceChargeBp: 0 } });
  const ctx = await t.ctxFor(t.ownerId);
  return { t, ps, ctx, burger };
}
async function connect(_ctx: Awaited<ReturnType<typeof setup>>["ctx"], t: Awaited<ReturnType<typeof setup>>["t"]) {
  await pay.saveGateway(op(t), t.orgId, { publicKey: PK, secretKey: SK, enabled: true });
  return t.ctxFor(t.ownerId); // reload so ctx.settings sees the new payment method
}
async function openOrder(ctx: Awaited<ReturnType<typeof setup>>["ctx"], t: Awaited<ReturnType<typeof setup>>["t"], burger: { id: string }) {
  const o = await orders.openOrder(ctx, { branchId: t.branchId, type: "takeaway" });
  await orders.addItems(ctx, o.id, [{ productId: burger.id, qty: 1 }]);
  return o;
}
const op = (t: { db: import("@/platform/db").Db }) => ({ db: t.db, adminId: "adm_test", name: "Operator" });
const sign = (secret: string, body: string) => createHmac("sha512", secret).update(body).digest("hex");

test("secret box encrypts, authenticates and never stores plaintext", () => {
  __setEnvForTests({});
  const boxed = encryptSecret(SK);
  assert.ok(!boxed.includes(SK)); assert.equal(decryptSecret(boxed), SK);
  assert.notEqual(encryptSecret(SK), boxed, "fresh IV each time");
  assert.throws(() => decryptSecret(boxed.slice(0, -2) + "AA"));
});

test("webhook signature is HMAC-SHA512 of the raw body", () => {
  const body = '{"event":"charge.success"}';
  assert.ok(verifyWebhookSignature(SK, body, sign(SK, body)));
  assert.ok(!verifyWebhookSignature(SK, body + " ", sign(SK, body)));
  assert.ok(!verifyWebhookSignature(SK, body, null));
  assert.ok(!verifyWebhookSignature("sk_test_other_key_123456", body, sign(SK, body)));
});

test("super admin saves a restaurant's Paystack keys: validated, encrypted at rest, never returned, enables the till method", async () => {
  const { t, ctx } = await setup();
  await assert.rejects(() => pay.saveGateway(op(t), t.orgId, { publicKey: "nope", secretKey: SK, enabled: true }), /public key/i);
  await assert.rejects(() => pay.saveGateway(op(t), t.orgId, { publicKey: PK, secretKey: "pk_nope", enabled: true }), /secret key/i);
  await assert.rejects(() => pay.saveGateway(op(t), t.orgId, { publicKey: PK, secretKey: null, enabled: true }), /secret key/i);
  await assert.rejects(() => pay.saveGateway(op(t), t.orgId, { publicKey: PK, secretKey: "sk_live_abcdefgh12345678", enabled: true }), /different modes/i);
  const view = await pay.saveGateway(op(t), t.orgId, { publicKey: PK, secretKey: SK, enabled: true });
  assert.deepEqual(await pay.getGatewayStatus(await t.ctxFor(t.ownerId)), { enabled: true, mode: "test" }, "owner sees status only");
  assert.equal(view.secretHint, "••••5678"); assert.equal(view.mode, "test");
  assert.equal(view.webhookUrl, `https://pos.example.com/api/webhooks/paystack/${t.orgId}`);
  assert.ok(!JSON.stringify(view).includes(SK));
  const raw = await t.db.col("paymentGateways").findOne({ orgId: t.orgId });
  assert.ok(!JSON.stringify(raw).includes(SK), "secret is not stored in the clear");
  assert.ok((await t.ctxFor(t.ownerId)).settings.paymentMethods.includes("paystack"));
  // blank secret keeps the stored one; disabling removes the method
  await pay.saveGateway(op(t), t.orgId, { publicKey: PK, secretKey: "", enabled: false });
  assert.equal(decryptSecret((await t.db.col<{ id: string; secretKeyEnc: string }>("paymentGateways").findOne({ orgId: t.orgId }))!.secretKeyEnc), SK);
  assert.ok(!(await t.ctxFor(t.ownerId)).settings.paymentMethods.includes("paystack"));
  // the generic settings form cannot switch Paystack on without an enabled gateway
  const c2 = await t.ctxFor(t.ownerId);
  await admin.saveSettings(c2, { taxLabel: "VAT", taxRatePercent: 0, taxInclusive: false, serviceChargePercent: 0, serviceChargeTaxable: false, serviceChargeTypes: [], orderTypes: ["dine_in"], paymentMethods: ["cash", "paystack"], requireShiftForCash: false, allowNegativeStock: true, kitchenLateMinutes: 15 } as never);
  assert.deepEqual((await t.ctxFor(t.ownerId)).settings.paymentMethods, ["cash"]);
});

test("test connection uses the stored key; a bad key is reported", async () => {
  const { t, ps } = await setup();
  await pay.saveGateway(op(t), t.orgId, { publicKey: PK, secretKey: SK, enabled: true });
  assert.deepEqual(await pay.testGateway(op(t), t.orgId), { mode: "test" });
  assert.equal(ps.calls.at(-1)!.key, SK);
  await pay.saveGateway(op(t), t.orgId, { publicKey: PK, secretKey: "sk_test_zzzzzzzz99999999", enabled: true });
  await assert.rejects(() => pay.testGateway(op(t), t.orgId), /Invalid key/);
});

test("cashiers cannot type in a Paystack payment by hand", async () => {
  const { t, ctx, burger } = await setup();
  const c = await connect(ctx, t);
  const o = await openOrder(c, t, burger);
  await assert.rejects(() => orders.pay(c, o.id, { orderId: o.id, method: "paystack", amountMinor: 1000 } as never), /Paystack checkout/);
});

test("order charge: link created with the restaurant's own key; paying closes the order exactly once", async () => {
  const { t, ctx, ps, burger } = await setup();
  const c = await connect(ctx, t);
  const o = await openOrder(c, t, burger);
  const total = (await orders.getOrder(c, o.id)).totalMinor;
  const ch = await pay.startOrderCharge(c, { orderId: o.id });
  assert.equal(ch.amountMinor, total);
  const init = ps.calls.find((x) => x.path === "/transaction/initialize")!;
  assert.equal(init.key, SK, "uses the restaurant's key, not the platform's");
  assert.equal(init.body!.amount, total); assert.equal(init.body!.currency, "KES");
  assert.equal(init.body!.callback_url, "https://pos.example.com/pay/paystack/return");
  assert.equal((await pay.startOrderCharge(c, { orderId: o.id })).reference, ch.reference, "double tap re-uses the pending link");

  let r = await pay.checkOrderCharge(c, ch.reference);
  assert.equal(r.status, "pending"); assert.equal((await orders.getOrder(c, o.id)).status, "open");

  ps.verify.set(ch.reference, { status: "success", amount: total, currency: "KES" });
  r = await pay.checkOrderCharge(c, ch.reference);
  assert.equal(r.status, "success"); assert.equal(r.order!.status, "closed");
  assert.equal(r.order!.payments.length, 1); assert.equal(r.order!.payments[0]!.method, "paystack");
  await pay.checkOrderCharge(c, ch.reference); await pay.settleByReference(t.db, ch.reference);
  assert.equal((await orders.getOrder(c, o.id)).payments.length, 1, "replays never double-record");
});

test("a charge for the wrong amount or currency is parked for review, not applied", async () => {
  const { t, ctx, ps, burger } = await setup();
  const c = await connect(ctx, t);
  const o = await openOrder(c, t, burger);
  const ch = await pay.startOrderCharge(c, { orderId: o.id });
  ps.verify.set(ch.reference, { status: "success", amount: 1, currency: "KES" });
  const r = await pay.checkOrderCharge(c, ch.reference);
  assert.equal(r.status, "review"); assert.equal((await orders.getOrder(c, o.id)).paidMinor, 0);
});

test("failed payments are marked failed; a paid charge on an already-settled order is parked", async () => {
  const { t, ctx, ps, burger } = await setup();
  const c = await connect(ctx, t);
  const o = await openOrder(c, t, burger);
  const a = await pay.startOrderCharge(c, { orderId: o.id });
  ps.verify.set(a.reference, { status: "failed", amount: 0, currency: "KES" });
  assert.equal((await pay.checkOrderCharge(c, a.reference)).status, "failed");
  const b = await pay.startOrderCharge(c, { orderId: o.id });
  const total = (await orders.getOrder(c, o.id)).totalMinor;
  await orders.openShift(c, { branchId: t.branchId, openingFloatMinor: 0 });
  await orders.pay(c, o.id, { orderId: o.id, method: "cash", amountMinor: total, tenderedMinor: total } as never); // paid by other means meanwhile
  ps.verify.set(b.reference, { status: "success", amount: total, currency: "KES" });
  const r = await pay.settleByReference(t.db, b.reference);
  assert.equal(r!.status, "review"); assert.equal((await orders.getOrder(c, o.id)).payments.length, 1);
});

test("restaurant webhook: bad signature refused; good one settles; another restaurant's endpoint cannot", async () => {
  const { t, ctx, ps, burger } = await setup();
  const c = await connect(ctx, t);
  const other = await createTenant(t.db);
    await pay.saveGateway(op(other), other.orgId, { publicKey: PK, secretKey: "sk_test_otherother123456", enabled: true });
  const o = await openOrder(c, t, burger);
  const ch = await pay.startOrderCharge(c, { orderId: o.id });
  const total = (await orders.getOrder(c, o.id)).totalMinor;
  ps.verify.set(ch.reference, { status: "success", amount: total, currency: "KES" });
  const body = JSON.stringify({ event: "charge.success", data: { reference: ch.reference } });

  assert.equal(await pay.handlePaystackWebhook(t.db, { orgId: t.orgId, rawBody: body, signature: "deadbeef" }), false);
  assert.equal(await pay.handlePaystackWebhook(t.db, { orgId: t.orgId, rawBody: body, signature: null }), false);
  assert.equal((await orders.getOrder(c, o.id)).status, "open");
  // other tenant signs with their own key and posts to their own endpoint: accepted, but it's not their charge, so nothing happens
  assert.equal(await pay.handlePaystackWebhook(t.db, { orgId: other.orgId, rawBody: body, signature: sign("sk_test_otherother123456", body) }), true);
  assert.equal((await orders.getOrder(c, o.id)).status, "open");
  // platform endpoint cannot settle order charges either
  __setEnvForTests({ PAYSTACK_SECRET_KEY: PLATFORM_SK });
  assert.equal(await pay.handlePaystackWebhook(t.db, { orgId: null, rawBody: body, signature: sign(PLATFORM_SK, body) }), true);
  assert.equal((await orders.getOrder(c, o.id)).status, "open");

  assert.equal(await pay.handlePaystackWebhook(t.db, { orgId: t.orgId, rawBody: body, signature: sign(SK, body) }), true);
  assert.equal((await orders.getOrder(c, o.id)).status, "closed");
  assert.equal(await pay.handlePaystackWebhook(t.db, { orgId: t.orgId, rawBody: body, signature: sign(SK, body) }), true);
  assert.equal((await orders.getOrder(c, o.id)).payments.length, 1);
  assert.equal(await pay.handlePaystackWebhook(t.db, { orgId: t.orgId, rawBody: "not json", signature: sign(SK, "not json") }), true);
});

test("a restaurant that has not enabled Paystack cannot start a charge", async () => {
  const { t, ctx, burger } = await setup();
  const o = await openOrder(ctx, t, burger);
  await assert.rejects(() => pay.startOrderCharge(ctx, { orderId: o.id }), /not enabled/i);
});

test("subscriptions use the platform keys from .env and activate the plan once", async () => {
  const { t, ps } = await setup();
  const ctx = await t.ctxFor(t.ownerId);
  await assert.rejects(() => pay.startSubscriptionCharge(ctx, { planCode: "growth" }), /not available/i);
  __setEnvForTests({ APP_URL: "https://pos.example.com", PAYSTACK_SECRET_KEY: PLATFORM_SK });
  assert.ok(pay.subscriptionPaymentsEnabled());
  const plans = await t.db.col<{ id: string; code: string; priceMinor: number; currency: string; isPublic: boolean }>("plans").find({});
  const paid = plans.find((p) => p.priceMinor > 0 && p.isPublic)!;
  const ch = await pay.startSubscriptionCharge(ctx, { planCode: paid.code });
  const init = ps.calls.find((x) => x.path === "/transaction/initialize")!;
  assert.equal(init.key, PLATFORM_SK, "subscription charges use the .env key");
  assert.equal(init.body!.amount, paid.priceMinor);

  ps.verify.set(ch.reference, { status: "success", amount: paid.priceMinor, currency: paid.currency });
  const body = JSON.stringify({ event: "charge.success", data: { reference: ch.reference } });
  assert.equal(await pay.handlePaystackWebhook(t.db, { orgId: null, rawBody: body, signature: "bad" }), false);
  assert.equal(await pay.handlePaystackWebhook(t.db, { orgId: null, rawBody: body, signature: sign(PLATFORM_SK, body) }), true);
  const sub = await t.db.col<{ id: string; planCode: string; status: string; currentPeriodEnd: string }>("subscriptions").findOne({ orgId: t.orgId });
  assert.equal(sub!.status, "active"); assert.equal(sub!.planCode, paid.code);
  const end1 = sub!.currentPeriodEnd; assert.ok(Date.parse(end1) > Date.now());
  // replay (webhook retry + redirect page) does not extend again
  await pay.handlePaystackWebhook(t.db, { orgId: null, rawBody: body, signature: sign(PLATFORM_SK, body) });
  await pay.settleByReference(t.db, ch.reference);
  assert.equal((await t.db.col<{ id: string; currentPeriodEnd: string }>("subscriptions").findOne({ orgId: t.orgId }))!.currentPeriodEnd, end1);
  const rows = await t.db.col<{ id: string; method: string; reference: string }>("billingPayments").find({ orgId: t.orgId });
  assert.equal(rows.length, 1); assert.equal(rows[0]!.method, "paystack"); assert.equal(rows[0]!.reference, ch.reference);
  // a suspended-for-nonpayment workspace is reactivated
  await t.db.col("organizations").update({ id: t.orgId }, { $set: { status: "suspended" } });
  const ch2 = await pay.startSubscriptionCharge(ctx, { planCode: paid.code });
  ps.verify.set(ch2.reference, { status: "success", amount: paid.priceMinor, currency: paid.currency });
  await pay.settleByReference(t.db, ch2.reference);
  assert.equal((await t.db.col<{ id: string; status: string }>("organizations").findOne({ id: t.orgId }))!.status, "active");
});
