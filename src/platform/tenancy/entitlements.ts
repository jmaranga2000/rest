import type { Feature, PlanLimits, LimitKey } from "./plans";
import { PlanFeatureError, PlanLimitError, SubscriptionReadOnlyError } from "../errors";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled";
export type AccessLevel = "full" | "read_only" | "blocked";

export interface SubscriptionState {
  planCode: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface AccessResult {
  level: AccessLevel;
  reason: "ok" | "trial_ending" | "trial_expired" | "grace_period" | "payment_overdue" | "cancelled" | "suspended" | "org_suspended";
  /** Days left in the trial / grace window, when relevant. */
  daysLeft: number | null;
}

/** Days after a missed renewal during which the workspace keeps working. */
export const GRACE_DAYS = 7;
const DAY = 86_400_000;

/**
 * What a tenant may do right now, given billing state. Pure and unit-tested.
 *  - full       everything their plan allows
 *  - read_only  can view and export, cannot create or change data
 *  - blocked    platform suspension: sign-in shows the suspension notice
 */
export function subscriptionAccess(sub: SubscriptionState, orgStatus: "active" | "suspended" | "closed", now: Date = new Date()): AccessResult {
  if (orgStatus !== "active") return { level: "blocked", reason: "org_suspended", daysLeft: null };
  const t = now.getTime();
  const ends = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
  switch (sub.status) {
    case "suspended":
      return { level: "blocked", reason: "suspended", daysLeft: null };
    case "trialing": {
      const end = ends(sub.trialEndsAt);
      if (end === null || t < end) {
        const daysLeft = end === null ? null : Math.max(0, Math.ceil((end - t) / DAY));
        return { level: "full", reason: daysLeft !== null && daysLeft <= 3 ? "trial_ending" : "ok", daysLeft };
      }
      return { level: "read_only", reason: "trial_expired", daysLeft: 0 };
    }
    case "cancelled": {
      const end = ends(sub.currentPeriodEnd);
      return end !== null && t < end
        ? { level: "full", reason: "cancelled", daysLeft: Math.ceil((end - t) / DAY) }
        : { level: "read_only", reason: "cancelled", daysLeft: 0 };
    }
    case "active":
    case "past_due": {
      const end = ends(sub.currentPeriodEnd);
      if (end === null || (sub.status === "active" && t <= end)) return { level: "full", reason: "ok", daysLeft: null };
      const graceEnd = end + GRACE_DAYS * DAY;
      if (t <= graceEnd) return { level: "full", reason: "grace_period", daysLeft: Math.max(0, Math.ceil((graceEnd - t) / DAY)) };
      return { level: "read_only", reason: "payment_overdue", daysLeft: 0 };
    }
  }
}

export function assertFeature(features: ReadonlySet<Feature>, feature: Feature, label?: string): void {
  if (!features.has(feature)) {
    throw new PlanFeatureError(`${label ?? feature} isn't included in your current plan. Upgrade to unlock it.`);
  }
}

export function assertWithinLimit(limits: PlanLimits, key: LimitKey, currentCount: number, label: string): void {
  const max = limits[key];
  if (max !== null && currentCount >= max) {
    throw new PlanLimitError(`Your plan allows ${max} ${label}. Upgrade to add more.`);
  }
}

export function assertWritable(access: AccessResult): void {
  if (access.level === "read_only") {
    const msg =
      access.reason === "trial_expired" ? "Your free trial has ended. Choose a plan to continue making changes."
      : access.reason === "payment_overdue" ? "Your subscription payment is overdue. Settle it to continue making changes."
      : undefined;
    throw new SubscriptionReadOnlyError(msg);
  }
  if (access.level === "blocked") {
    throw new SubscriptionReadOnlyError("This workspace is suspended. Contact support.");
  }
}
