import type { Db, Doc } from "@/platform/db";
import { newId, newSecret } from "@/platform/ids";
import { decryptSecret, encryptSecret } from "@/platform/crypto";
import { env } from "@/platform/env";
import { audit } from "@/platform/audit/audit";
import { requireBranch, requirePermission } from "@/platform/rbac/guard";
import { loadContextForUser, type Ctx } from "@/platform/auth/context";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/platform/errors";
import {
  PAYSTACK_CURRENCIES, checkKey, initializeTransaction, isPublicKey, isSecretKey, keyMode, verifyTransaction, verifyWebhookSignature,
} from "@/platform/paystack/client";
import { platformAudit, type PlatformCtx } from "@/modules/platform-admin/auth";
import { getPlan } from "@/modules/billing/plans.repo";
import { applySubscriptionPayment } from "@/modules/billing/subscription";
import { applyPayment, getOrder } from "@/modules/orders/service";
import type { OrderView } from "@/modules/orders/types";

/* ------------------------------------------------------------------ types */
export type ChargeStatus = "pending" | "success" | "failed" | "review";
export type ChargeDoc = Doc & {
  reference: string; scope: "order" | "subscription"; orgId: string; orderId: string | null; planCode: string | null;
  amountMinor: number; currency: string; email: string; status: ChargeStatus; createdBy: string; authorizationUrl: string;
  note: string | null; createdAt: string; settledAt: string | null;
};
type GatewayDoc = Doc & { orgId: string; provider: "paystack"; enabled: boolean; publicKey: string; secretKeyEnc: string; secretLast4: string; mode: "test" | "live"; createdAt: string; updatedAt: string };
const gatewayId = (orgId: string) => `${orgId}:paystack`;

export interface GatewayView { configured: boolean; enabled: boolean; publicKey: string; secretHint: string; mode: "test" | "live" | null; webhookUrl: string; returnUrl: string }

const appUrl = () => env().APP_URL.replace(/\/+$/, "");
const returnUrl = () => `${appUrl()}/pay/paystack/return`;
export const orgWebhookUrl = (orgId: string) => `${appUrl()}/api/webhooks/paystack/${orgId}`;

/* ------------------------------------------------------------------ restaurant gateway keys (SUPER ADMIN only) */
/**
 * A restaurant's Paystack keys are entered by the platform operator (super admin console), never by the owner.
 * Owners only see whether online payments are on (`getGatewayStatus`). Keys are encrypted at rest and never returned.
 */
type Operator = Pick<PlatformCtx, "db" | "adminId" | "name">;

export interface GatewayStatus { enabled: boolean; mode: "test" | "live" | null }
/** Owner-facing and key-free. */
export async function getGatewayStatus(ctx: Pick<Ctx, "db" | "org">): Promise<GatewayStatus> {
  const g = await ctx.db.col<GatewayDoc>("paymentGateways").findOne({ id: gatewayId(ctx.org.id) });
  return { enabled: !!g?.enabled, mode: g?.mode ?? null };
}

/** Operator-facing: everything except the secret itself. */
export async function getGatewayView(db: Db, orgId: string): Promise<GatewayView> {
  const g = await db.col<GatewayDoc>("paymentGateways").findOne({ id: gatewayId(orgId) });
  return { configured: !!g, enabled: !!g?.enabled, publicKey: g?.publicKey ?? "", secretHint: g ? `••••${g.secretLast4}` : "", mode: g?.mode ?? null, webhookUrl: orgWebhookUrl(orgId), returnUrl: returnUrl() };
}

async function requireOrg(db: Db, orgId: string): Promise<Doc & { name: string; currency: string }> {
  const o = await db.col<Doc & { name: string; currency: string }>("organizations").findOne({ id: orgId });
  if (!o) throw new NotFoundError("Organisation");
  return o;
}
async function setTillMethod(db: Db, orgId: string, on: boolean): Promise<void> {
  const row = await db.col<Doc & { paymentMethods: string[] }>("orgSettings").findOne({ id: orgId });
  const methods = new Set(row?.paymentMethods ?? ["cash"]);
  if (on) methods.add("paystack"); else methods.delete("paystack");
  await db.col("orgSettings").update({ id: orgId }, { $set: { paymentMethods: [...methods], updatedAt: new Date().toISOString() } });
}

/** Saves a restaurant's Paystack keys. A blank secret keeps the stored one. */
export async function saveGateway(op: Operator, orgId: string, i: { publicKey: string; secretKey?: string | null; enabled: boolean }): Promise<GatewayView> {
  const org = await requireOrg(op.db, orgId);
  const col = op.db.col<GatewayDoc>("paymentGateways");
  const existing = await col.findOne({ id: gatewayId(orgId) });
  const publicKey = i.publicKey.trim();
  const secret = i.secretKey?.trim() || null;
  if (!isPublicKey(publicKey)) throw new ValidationError("Enter the Paystack public key (starts with pk_test_ or pk_live_).", { publicKey: ["Enter the Paystack public key (starts with pk_test_ or pk_live_)."] });
  if (secret && !isSecretKey(secret)) throw new ValidationError("Enter the Paystack secret key (starts with sk_test_ or sk_live_).", { secretKey: ["Enter the Paystack secret key (starts with sk_test_ or sk_live_)."] });
  if (!secret && !existing) throw new ValidationError("Enter the Paystack secret key.", { secretKey: ["Enter the Paystack secret key."] });
  const mode = keyMode(publicKey);
  if (secret && keyMode(secret) !== mode) throw new ValidationError("The public and secret keys are from different modes (test vs live).", { secretKey: ["Use a matching test or live pair."] });
  if (!secret && existing && existing.mode !== mode) throw new ValidationError("Changing between test and live keys needs the secret key too.", { secretKey: ["Enter the matching secret key."] });
  const now = new Date().toISOString();
  if (existing) await col.update({ id: existing.id }, { $set: { publicKey, enabled: i.enabled, mode, updatedAt: now, ...(secret ? { secretKeyEnc: encryptSecret(secret), secretLast4: secret.slice(-4) } : {}) } });
  else await col.insert({ id: gatewayId(orgId), orgId, provider: "paystack", enabled: i.enabled, publicKey, secretKeyEnc: encryptSecret(secret!), secretLast4: secret!.slice(-4), mode, createdAt: now, updatedAt: now });
  await setTillMethod(op.db, orgId, i.enabled); // "Paystack" shows at the till only while the gateway is on
  await platformAudit(op, { action: "gateway.paystack", orgId, summary: `${existing ? "Updated" : "Connected"} Paystack for ${org.name} (${mode} keys, ${i.enabled ? "enabled" : "disabled"}${secret ? ", secret key replaced" : ""})` });
  return getGatewayView(op.db, orgId);
}

export async function removeGateway(op: Operator, orgId: string): Promise<void> {
  const org = await requireOrg(op.db, orgId);
  await op.db.col("paymentGateways").delete({ id: gatewayId(orgId) });
  await setTillMethod(op.db, orgId, false);
  await platformAudit(op, { action: "gateway.remove", orgId, summary: `Disconnected Paystack for ${org.name}` });
}

export async function testGateway(op: Operator, orgId: string): Promise<{ mode: "test" | "live" }> {
  const g = await op.db.col<GatewayDoc>("paymentGateways").findOne({ id: gatewayId(orgId) });
  if (!g) throw new BusinessRuleError("Save the Paystack keys first.");
  await checkKey(decryptSecret(g.secretKeyEnc));
  return { mode: g.mode };
}

async function orgSecret(db: Db, orgId: string, requireEnabled = true): Promise<string> {
  const g = await db.col<GatewayDoc>("paymentGateways").findOne({ id: gatewayId(orgId) });
  if (!g || (requireEnabled && !g.enabled)) throw new BusinessRuleError("Paystack is not enabled for this business. Contact support to connect it.");
  return decryptSecret(g.secretKeyEnc);
}
function platformSecret(): string {
  const k = env().PAYSTACK_SECRET_KEY;
  if (!k) throw new BusinessRuleError("Online subscription payments are not available right now. Contact support.");
  return k;
}
export interface PlatformPaystackInfo { configured: boolean; mode: "test" | "live" | null; callbackUrl: string; webhookUrl: string }
export function platformPaystackInfo(): PlatformPaystackInfo {
  const k = env().PAYSTACK_SECRET_KEY;
  return { configured: !!k && !!env().PAYSTACK_PUBLIC_KEY, mode: k ? keyMode(k) : null, callbackUrl: returnUrl(), webhookUrl: `${appUrl()}/api/webhooks/paystack` };
}
export const subscriptionPaymentsEnabled = (): boolean => !!env().PAYSTACK_SECRET_KEY;

/* ------------------------------------------------------------------ starting a charge */
const newReference = (prefix: string) => `${prefix}_${newSecret(14)}`;
const fallbackEmail = () => { const h = new URL(appUrl()).hostname; return `customer@${h.includes(".") ? h : "example.com"}`; };

/** Cashier asks the customer to pay an order's balance through Paystack (card / mobile money / bank). Returns a payment link. */
export async function startOrderCharge(ctx: Ctx, i: { orderId: string; amountMinor?: number | null; email?: string | null }): Promise<{ reference: string; authorizationUrl: string; amountMinor: number }> {
  requirePermission(ctx, "payments.collect");
  if (!ctx.settings.paymentMethods.includes("paystack")) throw new BusinessRuleError("Paystack is not enabled.");
  const secret = await orgSecret(ctx.db, ctx.org.id);
  if (!(PAYSTACK_CURRENCIES as readonly string[]).includes(ctx.org.currency)) throw new BusinessRuleError(`Paystack does not support ${ctx.org.currency}. Supported: ${PAYSTACK_CURRENCIES.join(", ")}.`);
  const order = await getOrder(ctx, i.orderId);
  requireBranch(ctx, order.branchId);
  if (order.status !== "open") throw new BusinessRuleError("This order is not open.");
  const due = order.totalMinor - order.paidMinor;
  if (due <= 0) throw new BusinessRuleError("This order is already fully paid.");
  const amountMinor = Math.min(i.amountMinor ?? due, due);
  if (amountMinor <= 0) throw new ValidationError("Enter an amount.", { amountMinor: ["Enter an amount."] });
  // Re-use an identical pending link so a double tap doesn't create two charges.
  const dup = (await ctx.db.col<ChargeDoc>("paystackCharges").find({ orgId: ctx.org.id, orderId: order.id, status: "pending" }, { sort: { createdAt: -1 }, limit: 1 }))[0];
  if (dup && dup.amountMinor === amountMinor && Date.now() - Date.parse(dup.createdAt) < 30 * 60_000) return { reference: dup.reference, authorizationUrl: dup.authorizationUrl, amountMinor };
  const email = i.email?.trim() || fallbackEmail();
  const reference = newReference("ord");
  const init = await initializeTransaction(secret, { email, amountMinor, currency: ctx.org.currency, reference, callbackUrl: returnUrl(), metadata: { orgId: ctx.org.id, orderId: order.id, orderNumber: order.number, kind: "order" } });
  await ctx.db.col("paystackCharges").insert({ id: newId("payment"), reference, scope: "order", orgId: ctx.org.id, orderId: order.id, planCode: null, amountMinor, currency: ctx.org.currency, email, status: "pending", createdBy: ctx.userId, authorizationUrl: init.authorization_url, note: null, createdAt: new Date().toISOString(), settledAt: null });
  return { reference, authorizationUrl: init.authorization_url, amountMinor };
}

/** Restaurant owner pays for (or renews) a subscription plan with the PLATFORM's Paystack account (keys from .env). */
export async function startSubscriptionCharge(ctx: Ctx, i: { planCode: string }): Promise<{ reference: string; authorizationUrl: string }> {
  requirePermission(ctx, "billing.manage");
  const secret = platformSecret();
  const plan = await getPlan(ctx.db, i.planCode);
  if (!plan || !plan.isActive || (!plan.isPublic && plan.code !== ctx.plan.code)) throw new NotFoundError("Plan");
  if (plan.priceMinor <= 0) throw new BusinessRuleError("This plan is free; there is nothing to pay.");
  const user = await ctx.db.col<Doc & { email: string }>("users").findOne({ orgId: ctx.org.id, id: ctx.userId });
  const email = user?.email || fallbackEmail();
  const reference = newReference("sub");
  const init = await initializeTransaction(secret, { email, amountMinor: plan.priceMinor, currency: plan.currency, reference, callbackUrl: returnUrl(), metadata: { orgId: ctx.org.id, planCode: plan.code, kind: "subscription" } });
  await ctx.db.col("paystackCharges").insert({ id: newId("billing"), reference, scope: "subscription", orgId: ctx.org.id, orderId: null, planCode: plan.code, amountMinor: plan.priceMinor, currency: plan.currency, email, status: "pending", createdBy: ctx.userId, authorizationUrl: init.authorization_url, note: null, createdAt: new Date().toISOString(), settledAt: null });
  await audit(ctx, { action: "billing.paystack.start", entityType: "plan", summary: `Started Paystack payment for plan ${plan.name}` });
  return { reference, authorizationUrl: init.authorization_url };
}

/* ------------------------------------------------------------------ settling */
export interface SettleResult { status: ChargeStatus; scope: "order" | "subscription"; orgId: string; orderId: string | null; message: string | null }

/**
 * Confirms a charge with Paystack (never trusting a webhook body or a redirect) and, if it succeeded for exactly the
 * amount and currency we asked for, records it. Safe to call any number of times, from any number of places
 * (webhook, redirect page, cashier polling): the first caller to flip `pending → success` does the work.
 */
export async function settleByReference(db: Db, reference: string): Promise<SettleResult | null> {
  const col = db.col<ChargeDoc>("paystackCharges");
  const charge = await col.findOne({ reference });
  if (!charge) return null;
  const done = (c: ChargeDoc, message: string | null = c.note): SettleResult => ({ status: c.status, scope: c.scope, orgId: c.orgId, orderId: c.orderId, message });
  if (charge.status !== "pending") return done(charge);

  const secret = charge.scope === "subscription" ? platformSecret() : await orgSecret(db, charge.orgId, false);
  const v = await verifyTransaction(secret, reference);
  if (v.status === "abandoned" || v.status === "ongoing" || v.status === "pending" || v.status === "queued") return done(charge, "Waiting for the customer to complete payment.");
  const now = new Date().toISOString();
  if (v.status !== "success") {
    await col.update({ id: charge.id, status: "pending" }, { $set: { status: "failed", note: v.gateway_response ?? v.status, settledAt: now } });
    return done({ ...charge, status: "failed", note: v.gateway_response ?? v.status });
  }
  if (Number(v.amount) !== charge.amountMinor || String(v.currency).toUpperCase() !== charge.currency.toUpperCase()) {
    const note = `Paid ${v.amount} ${v.currency}, expected ${charge.amountMinor} ${charge.currency}. Needs manual review.`;
    await col.update({ id: charge.id, status: "pending" }, { $set: { status: "review", note, settledAt: now } });
    return done({ ...charge, status: "review", note });
  }

  if (charge.scope === "order") {
    // Make sure the order can still take this payment BEFORE claiming the charge, so a refusal never half-applies.
    const order = await db.col<Doc & { status: string; totalMinor: number; paidMinor: number }>("orders").findOne({ orgId: charge.orgId, id: charge.orderId! });
    if (!order || order.status !== "open" || Number(order.totalMinor) - Number(order.paidMinor) < charge.amountMinor) {
      const note = "Customer paid, but the order is no longer open or was already paid. Refund this Paystack payment or reconcile manually.";
      await col.update({ id: charge.id, status: "pending" }, { $set: { status: "review", note, settledAt: now } });
      return done({ ...charge, status: "review", note });
    }
  }
  return db.tx(async (tx) => {
    const claimed = await tx.col<ChargeDoc>("paystackCharges").findOneAndUpdate({ id: charge.id, status: "pending" }, { $set: { status: "success", settledAt: now } });
    if (!claimed) return done((await tx.col<ChargeDoc>("paystackCharges").findOne({ id: charge.id })) ?? charge); // someone else settled it a moment ago
    if (charge.scope === "subscription") {
      const r = await applySubscriptionPayment(tx, { orgId: charge.orgId, planCode: charge.planCode, amountMinor: charge.amountMinor, method: "paystack", reference, recordedBy: null });
      await tx.col("platformAuditLogs").insert({ id: newId("audit"), adminId: null, adminName: "Paystack", orgId: charge.orgId, action: "billing.payment", summary: `Paystack payment of ${charge.amountMinor} ${charge.currency} for ${r.planName} (${reference})`, data: null, createdAt: now });
      return done({ ...charge, status: "success" }, null);
    }
    const ctx = await loadContextForUser(tx, charge.orgId, charge.createdBy);
    await applyPayment(ctx, charge.orderId!, { orderId: charge.orderId!, method: "paystack", amountMinor: charge.amountMinor, reference, clientKey: `paystack:${reference}` } as never);
    await audit(ctx, { action: "payment.paystack", entityType: "order", entityId: charge.orderId!, summary: `Paystack payment of ${charge.amountMinor} ${charge.currency} received (${reference})` });
    return done({ ...charge, status: "success" }, null);
  });
}

/** Cashier polling: only the org that created the charge may ask. */
export async function checkOrderCharge(ctx: Ctx, reference: string): Promise<{ status: ChargeStatus; message: string | null; order: OrderView | null }> {
  requirePermission(ctx, "payments.collect");
  const c = await ctx.db.col<ChargeDoc>("paystackCharges").findOne({ reference, orgId: ctx.org.id, scope: "order" });
  if (!c) throw new NotFoundError("Payment");
  const r = (await settleByReference(ctx.db, reference))!;
  return { status: r.status, message: r.message, order: r.status === "success" ? await getOrder(ctx, c.orderId!) : null };
}

/* ------------------------------------------------------------------ webhooks */
/**
 * `orgId` null = the platform endpoint (subscriptions, signed with the .env secret key);
 * otherwise a restaurant's endpoint, signed with THAT restaurant's secret key.
 * Returns false when the signature is wrong (caller answers 401). Everything else answers 200 so Paystack stops retrying.
 */
export async function handlePaystackWebhook(db: Db, i: { orgId: string | null; rawBody: string; signature: string | null }): Promise<boolean> {
  let secret: string;
  try { secret = i.orgId ? await orgSecret(db, i.orgId, false) : platformSecret(); } catch { return false; }
  if (!verifyWebhookSignature(secret, i.rawBody, i.signature)) return false;
  let evt: { event?: string; data?: { reference?: string } };
  try { evt = JSON.parse(i.rawBody); } catch { return true; }
  const reference = evt.data?.reference;
  if (evt.event !== "charge.success" || !reference) return true;
  const c = await db.col<ChargeDoc>("paystackCharges").findOne({ reference });
  // A restaurant endpoint may only settle that restaurant's order charges; the platform endpoint only subscriptions.
  if (!c || (i.orgId ? c.orgId !== i.orgId || c.scope !== "order" : c.scope !== "subscription")) return true;
  // Gateway/network failures propagate (route answers 500, Paystack retries); a business-rule refusal is final.
  try { await settleByReference(db, reference); } catch (e) { if (!(e instanceof BusinessRuleError)) throw e; }
  return true;
}
