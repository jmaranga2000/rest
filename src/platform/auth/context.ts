import type { Db } from "../db";
import { AuthenticationError } from "../errors";
import { hashToken } from "./tokens";
import { ALL_FEATURES, type Feature, type PlanLimits } from "../tenancy/plans";
import { subscriptionAccess, type AccessResult, type SubscriptionState, type SubscriptionStatus } from "../tenancy/entitlements";
import { loadSettings, type OrgSettings } from "../tenancy/settings";
import { isPermission, type Permission } from "../rbac/permissions";

export interface BranchRef {
  id: string;
  code: string;
  name: string;
  timezone: string;
}

/**
 * Everything a request needs to know about who is acting and what they may do.
 * Built from the database on every request (never from the cookie payload), so
 * role changes, deactivation and suspension take effect immediately.
 */
export interface Ctx {
  db: Db;
  sessionId: string;
  sessionKind: "web" | "pin";
  terminalId: string | null;
  userId: string;
  userName: string;
  userColor: string;
  roleKey: string;
  roleName: string;
  mustChangePassword: boolean;
  org: {
    id: string; name: string; slug: string; currency: string; timezone: string; locale: string;
    logoUrl: string | null; onboardingComplete: boolean;
  };
  settings: OrgSettings;
  permissions: ReadonlySet<Permission>;
  plan: { code: string; name: string };
  features: ReadonlySet<Feature>;
  limits: PlanLimits;
  subscription: SubscriptionState;
  access: AccessResult;
  branches: BranchRef[];
  activeBranch: BranchRef | null;
  ip: string | null;
}

const TOUCH_INTERVAL_MS = 5 * 60_000;

type D<T> = { id: string } & T;

export async function loadContext(db: Db, token: string, meta: { ip?: string | null; now?: Date } = {}): Promise<Ctx> {
  const now = meta.now ?? new Date();
  const nowIso = now.toISOString();
  const session = await db.col<D<{ orgId: string; userId: string; kind: "web" | "pin"; terminalId: string | null; branchId: string | null; lastSeenAt: string }>>("sessions")
    .findOne({ tokenHash: hashToken(token), revokedAt: null, expiresAt: { $gt: nowIso } });
  if (!session) throw new AuthenticationError();
  return buildContext(db, session, now, meta.ip ?? null, true);
}

/**
 * A context for a background job acting on behalf of an existing user (e.g. a payment webhook settling
 * an order the cashier started). No session is created or touched; the user must still be active.
 */
export async function loadContextForUser(db: Db, orgId: string, userId: string, now: Date = new Date()): Promise<Ctx> {
  return buildContext(db, { id: "system", orgId, userId, kind: "web", terminalId: null, branchId: null, lastSeenAt: now.toISOString() }, now, null, false);
}

type SessionLike = { id: string; orgId: string; userId: string; kind: "web" | "pin"; terminalId: string | null; branchId: string | null; lastSeenAt: string };
async function buildContext(db: Db, session: SessionLike, now: Date, ip: string | null, touch: boolean): Promise<Ctx> {
  const nowIso = now.toISOString();
  const orgId = session.orgId;
  const [user, org, sub] = await Promise.all([
    db.col<D<{ name: string; color: string; status: string; mustChangePassword: boolean; roleId: string; branchIds: string[] }>>("users").findOne({ id: session.userId, orgId }),
    db.col<D<{ name: string; slug: string; currency: string; timezone: string; locale: string; logoUrl: string | null; status: "active" | "suspended" | "closed"; onboardingStatus: "in_progress" | "completed" }>>("organizations").findOne({ id: orgId }),
    db.col<D<{ planCode: string; status: SubscriptionStatus; trialEndsAt: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean }>>("subscriptions").findOne({ orgId }),
  ]);
  if (!user || user.status !== "active" || !org || !sub) throw new AuthenticationError();
  const role = await db.col<D<{ key: string; name: string; allBranches: boolean; permissions: string[] }>>("roles").findOne({ id: user.roleId, orgId });
  if (!role) throw new AuthenticationError();

  const [planRow, settings, branchDocs] = await Promise.all([
    db.col<D<{ code: string; name: string; features: string[]; limits: PlanLimits }>>("plans").findOne({ code: sub.planCode }),
    loadSettings(db, orgId),
    db.col<D<{ code: string; name: string; timezone: string | null }>>("branches").find(
      { orgId, isActive: true, ...(role.allBranches ? {} : { id: { $in: user.branchIds ?? [] } }) }, { sort: { name: 1 } }),
  ]);
  const branchRows: BranchRef[] = branchDocs.map((b) => ({ id: b.id, code: b.code, name: b.name, timezone: b.timezone ?? "" }));
  const s = { sessionId: session.id, sessionKind: session.kind, terminalId: session.terminalId, sessionBranchId: session.branchId, lastSeenAt: session.lastSeenAt,
    userId: user.id, userName: user.name, userColor: user.color, mustChangePassword: Boolean(user.mustChangePassword), roleKey: role.key, roleName: role.name,
    orgId, orgName: org.name, orgSlug: org.slug, orgCurrency: org.currency, orgTimezone: org.timezone, orgLocale: org.locale, orgLogoUrl: org.logoUrl, orgStatus: org.status, onboardingStatus: org.onboardingStatus,
    planCode: sub.planCode, subStatus: sub.status, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd) };
  const permRows = role.permissions.map((permission) => ({ permission }));

  const subscription: SubscriptionState = {
    planCode: s.planCode, status: s.subStatus, trialEndsAt: s.trialEndsAt,
    currentPeriodEnd: s.currentPeriodEnd, cancelAtPeriodEnd: s.cancelAtPeriodEnd,
  };
  const featureList = (planRow?.features ?? []).filter((f): f is Feature => (ALL_FEATURES as string[]).includes(f));
  const limits = planRow?.limits ?? { branches: 1, users: 5, terminals: 2 };
  const branches = branchRows.map((b) => ({ ...b, timezone: b.timezone || s.orgTimezone }));
  const activeBranch = branches.find((b) => b.id === s.sessionBranchId) ?? branches[0] ?? null;

  // Sliding "last seen" — written at most every few minutes to keep reads cheap.
  if (touch && now.getTime() - new Date(s.lastSeenAt).getTime() > TOUCH_INTERVAL_MS) {
    await db.col("sessions").update({ id: s.sessionId }, { $set: { lastSeenAt: nowIso } });
  }

  return {
    db,
    sessionId: s.sessionId, sessionKind: s.sessionKind, terminalId: s.terminalId,
    userId: s.userId, userName: s.userName, userColor: s.userColor, roleKey: s.roleKey, roleName: s.roleName,
    mustChangePassword: s.mustChangePassword,
    org: {
      id: s.orgId, name: s.orgName, slug: s.orgSlug, currency: s.orgCurrency, timezone: s.orgTimezone, locale: s.orgLocale,
      logoUrl: s.orgLogoUrl, onboardingComplete: s.onboardingStatus === "completed",
    },
    settings,
    permissions: new Set(permRows.map((r) => r.permission).filter(isPermission)),
    plan: { code: s.planCode, name: planRow?.name ?? s.planCode },
    features: new Set(featureList),
    limits,
    subscription,
    access: subscriptionAccess(subscription, s.orgStatus, now),
    branches,
    activeBranch,
    ip,
  };
}

/** Re-bind a context to a transaction handle (used by the action wrapper). */
export function withDb(ctx: Ctx, db: Db): Ctx {
  return { ...ctx, db };
}
