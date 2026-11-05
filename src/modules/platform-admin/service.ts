import type { PlatformCtx } from "./auth";
import { platformAudit } from "./auth";
import type { Doc } from "@/platform/db";
import { byIds } from "@/platform/db";
import { newId } from "@/platform/ids";
import { BusinessRuleError, NotFoundError } from "@/platform/errors";
import { getPlan, savePlan } from "@/modules/billing/plans.repo";
import { applySubscriptionPayment } from "@/modules/billing/subscription";
import type { PlanDef } from "@/platform/tenancy/plans";
import type { z } from "zod";
import type { planSchema } from "./schema";
import { revokeAllSessions } from "@/platform/auth/sessions";

export interface OrgRow { id: string; name: string; slug: string; status: string; planCode: string; subStatus: string; trialEndsAt: string | null; currentPeriodEnd: string | null; createdAt: string; userCount: number; branchCount: number; ownerEmail: string | null; orders30d: number }

type OrgDoc = Doc & { name: string; slug: string; status: string; email: string | null; createdAt: string };
type SubDoc = Doc & { orgId: string; planCode: string; status: string; trialEndsAt: string | null; currentPeriodEnd: string | null };

export async function listOrgs(ctx: PlatformCtx, opts: { q?: string; status?: string } = {}): Promise<OrgRow[]> {
  const q = opts.q?.trim().toLowerCase();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [orgs, subs, users, branches, closed] = await Promise.all([
    ctx.db.col<OrgDoc>("organizations").find({}),
    ctx.db.col<SubDoc>("subscriptions").find({}),
    ctx.db.col<Doc & { orgId: string }>("users").find({ status: "active" }),
    ctx.db.col<Doc & { orgId: string }>("branches").find({ isActive: true }),
    ctx.db.col<Doc & { orgId: string }>("orders").find({ status: "closed", businessDate: { $gte: since } }),
  ]);
  const tally = (rows: { orgId: string }[]) => { const m = new Map<string, number>(); for (const r of rows) m.set(r.orgId, (m.get(r.orgId) ?? 0) + 1); return m; };
  const uc = tally(users), bc = tally(branches), oc = tally(closed);
  const sub = new Map(subs.map((s) => [s.orgId, s]));
  return orgs.flatMap((o) => {
    const s = sub.get(o.id);
    if (!s) return [];
    if (q && !`${o.name} ${o.email ?? ""} ${o.slug}`.toLowerCase().includes(q)) return [];
    if (opts.status && o.status !== opts.status && s.status !== opts.status) return [];
    return [{ id: o.id, name: o.name, slug: o.slug, status: o.status, planCode: s.planCode, subStatus: s.status, trialEndsAt: s.trialEndsAt ?? null, currentPeriodEnd: s.currentPeriodEnd ?? null, createdAt: o.createdAt, userCount: uc.get(o.id) ?? 0, branchCount: bc.get(o.id) ?? 0, ownerEmail: o.email ?? null, orders30d: oc.get(o.id) ?? 0 }];
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 300);
}

export interface PlatformStats { orgs: number; active: number; trialing: number; suspended: number; mrrMinor: number; pendingRequests: number; newThisMonth: number }
export async function getStats(ctx: PlatformCtx): Promise<PlatformStats> {
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`;
  const [orgs, subs, plans, pending] = await Promise.all([
    ctx.db.col<OrgDoc>("organizations").find({}), ctx.db.col<SubDoc>("subscriptions").find({}),
    ctx.db.col<Doc & { code: string; billingInterval: string; priceMinor: number }>("plans").find({}), ctx.db.col("planChangeRequests").count({ status: "pending" }),
  ]);
  const orgStatus = new Map(orgs.map((o) => [o.id, o.status]));
  const plan = new Map(plans.map((p) => [p.code, p]));
  const mrr = subs.filter((s) => s.status === "active" && orgStatus.get(s.orgId) === "active").reduce((a, s) => {
    const p = plan.get(s.planCode);
    return a + (p ? (p.billingInterval === "year" ? Math.trunc(Number(p.priceMinor) / 12) : Number(p.priceMinor)) : 0);
  }, 0);
  return {
    orgs: orgs.length, active: subs.filter((s) => s.status === "active").length, trialing: subs.filter((s) => s.status === "trialing").length,
    suspended: orgs.filter((o) => o.status === "suspended").length, mrrMinor: mrr, pendingRequests: pending, newThisMonth: orgs.filter((o) => o.createdAt >= monthStart).length,
  };
}

export async function getOrgDetail(ctx: PlatformCtx, id: string) {
  const org = (await listOrgs(ctx)).find((o) => o.id === id) ?? null;
  if (!org) throw new NotFoundError("Organisation");
  const [payments, ownerRole, audit] = await Promise.all([
    ctx.db.col<Doc & { amountMinor: number; currency: string; method: string; reference: string | null; planCode: string | null; createdAt: string }>("billingPayments").find({ orgId: id }, { sort: { createdAt: -1 }, limit: 20 }),
    ctx.db.col("roles").findOne({ orgId: id, key: "owner" }),
    ctx.db.col<Doc & { adminName: string | null; action: string; summary: string; createdAt: string }>("platformAuditLogs").find({ orgId: id }, { sort: { createdAt: -1, id: -1 }, limit: 20 }),
  ]);
  const ownerDocs = ownerRole ? await ctx.db.col<Doc & { name: string; email: string | null; lastLoginAt: string | null }>("users").find({ orgId: id, roleId: ownerRole.id }, { sort: { name: 1 } }) : [];
  const orgDoc = await ctx.db.col<Doc & { currency: string }>("organizations").findOne({ id });
  return {
    org, currency: orgDoc?.currency ?? "KES",
    payments: payments.map((p) => ({ id: p.id, amountMinor: Number(p.amountMinor), currency: p.currency, method: p.method, reference: p.reference ?? null, planCode: p.planCode ?? null, createdAt: p.createdAt })),
    owners: ownerDocs.map((u) => ({ name: u.name, email: u.email ?? null, lastLoginAt: u.lastLoginAt ?? null })),
    audit: audit.map((a) => ({ id: a.id, adminName: a.adminName ?? null, action: a.action, summary: a.summary, createdAt: a.createdAt })),
  };
}

export async function suspendOrg(ctx: PlatformCtx, id: string, reason: string): Promise<void> {
  const o = await ctx.db.col<OrgDoc>("organizations").findOne({ id });
  if (!o) throw new NotFoundError("Organisation");
  await ctx.db.col("organizations").update({ id }, { $set: { status: "suspended", suspendedReason: reason, updatedAt: new Date().toISOString() } });
  await ctx.db.col("sessions").update({ orgId: id, revokedAt: null }, { $set: { revokedAt: new Date().toISOString() } });
  await platformAudit(ctx, { action: "org.suspend", orgId: id, summary: `Suspended ${o.name}: ${reason}` });
}
export async function reactivateOrg(ctx: PlatformCtx, id: string): Promise<void> {
  const o = await ctx.db.col<OrgDoc>("organizations").findOne({ id });
  if (!o) throw new NotFoundError("Organisation");
  await ctx.db.col("organizations").update({ id }, { $set: { status: "active", suspendedReason: null, updatedAt: new Date().toISOString() } });
  await platformAudit(ctx, { action: "org.reactivate", orgId: id, summary: `Reactivated ${o.name}` });
}
export async function changePlan(ctx: PlatformCtx, id: string, planCode: string): Promise<void> {
  const plan = await getPlan(ctx.db, planCode);
  if (!plan || !plan.isActive) throw new NotFoundError("Plan");
  const changed = await ctx.db.col("subscriptions").update({ orgId: id }, { $set: { planCode, updatedAt: new Date().toISOString() } });
  if (!changed) throw new NotFoundError("Organisation");
  await platformAudit(ctx, { action: "org.plan", orgId: id, summary: `Moved to plan ${plan.name}` });
}
export async function extendTrial(ctx: PlatformCtx, id: string, days: number): Promise<void> {
  const s = await ctx.db.col<SubDoc>("subscriptions").findOne({ orgId: id });
  if (!s) throw new NotFoundError("Organisation");
  const base = Math.max(Date.now(), s.trialEndsAt ? Date.parse(s.trialEndsAt) : 0);
  await ctx.db.col("subscriptions").update({ orgId: id }, { $set: { status: "trialing", trialEndsAt: new Date(base + days * 86_400_000).toISOString(), updatedAt: new Date().toISOString() } });
  await platformAudit(ctx, { action: "org.trial", orgId: id, summary: `Extended trial by ${days} days` });
}
/** Records a payment received outside the app (M-Pesa, bank) and extends the subscription one period. */
export async function recordPayment(ctx: PlatformCtx, i: { id: string; amountMinor: number; method: string; reference?: string | null; planCode?: string | null }): Promise<void> {
  const r = await applySubscriptionPayment(ctx.db, { orgId: i.id, planCode: i.planCode, amountMinor: i.amountMinor, method: i.method, reference: i.reference, recordedBy: ctx.adminId });
  await platformAudit(ctx, { action: "billing.payment", orgId: i.id, summary: `Recorded ${i.method} payment of ${i.amountMinor} for ${r.planName}` });
}

export interface RequestRow { id: string; orgId: string; orgName: string; fromPlan: string; toPlan: string; note: string | null; createdAt: string }
export async function listPlanRequests(ctx: PlatformCtx): Promise<RequestRow[]> {
  const rows = await ctx.db.col<Doc & { orgId: string; fromPlan: string; toPlan: string; note: string | null; createdAt: string }>("planChangeRequests").find({ status: "pending" }, { sort: { createdAt: 1, id: 1 } });
  const orgs = await byIds<OrgDoc>(ctx.db, "organizations", null, rows.map((r) => r.orgId));
  return rows.flatMap((r) => { const o = orgs.get(r.orgId); return o ? [{ id: r.id, orgId: r.orgId, orgName: o.name, fromPlan: r.fromPlan, toPlan: r.toPlan, note: r.note ?? null, createdAt: r.createdAt }] : []; });
}
export async function reviewRequest(ctx: PlatformCtx, id: string, approve: boolean, note?: string): Promise<void> {
  const r = await ctx.db.col<Doc & { orgId: string; toPlan: string; status: string }>("planChangeRequests").findOne({ id });
  if (!r) throw new NotFoundError("Request");
  if (r.status !== "pending") throw new BusinessRuleError("This request was already reviewed.");
  if (approve) await changePlan(ctx, r.orgId, r.toPlan);
  await ctx.db.col("planChangeRequests").update({ id }, { $set: { status: approve ? "approved" : "rejected", reviewedBy: ctx.adminId, reviewNote: note ?? null, reviewedAt: new Date().toISOString() } });
  await platformAudit(ctx, { action: approve ? "request.approve" : "request.reject", orgId: r.orgId, summary: `${approve ? "Approved" : "Rejected"} plan request → ${r.toPlan}` });
}

export async function listPlatformAudit(ctx: PlatformCtx) {
  const rows = await ctx.db.col<Doc & { adminName: string | null; action: string; summary: string; createdAt: string; orgId: string | null }>("platformAuditLogs").find({}, { sort: { createdAt: -1, id: -1 }, limit: 200 });
  const orgs = await byIds<OrgDoc>(ctx.db, "organizations", null, rows.map((r) => r.orgId));
  return rows.map((r) => ({ id: r.id, adminName: r.adminName ?? null, action: r.action, summary: r.summary, createdAt: r.createdAt, orgName: r.orgId ? orgs.get(r.orgId)?.name ?? null : null }));
}

export async function savePlanDef(ctx: PlatformCtx, i: z.infer<typeof planSchema>): Promise<void> {
  const def: PlanDef = { code: i.code, name: i.name, description: i.description ?? "", priceMinor: i.priceMinor, currency: i.currency, billingInterval: i.billingInterval, trialDays: i.trialDays,
    limits: { branches: i.limitBranches, users: i.limitUsers, terminals: i.limitTerminals }, features: i.features as PlanDef["features"], highlights: i.highlights, isPublic: i.isPublic, isActive: i.isActive, sortOrder: i.sortOrder };
  await savePlan(ctx.db, def);
  await platformAudit(ctx, { action: "plan.save", summary: `Saved plan ${i.code}` });
}
