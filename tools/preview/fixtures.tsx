import type { Ctx } from "@/platform/auth/context";
import { ALL_PERMISSIONS } from "@/platform/rbac/permissions";
import { ALL_FEATURES } from "@/platform/tenancy/plans";
import type { OrgSettings } from "@/platform/tenancy/settings";

export const settings: OrgSettings = {
  taxLabel: "VAT", taxRateBp: 1600, taxInclusive: true, serviceChargeBp: 0, serviceChargeTaxable: false, serviceChargeTypes: ["dine_in"],
  orderTypes: ["dine_in", "takeaway", "delivery"], paymentMethods: ["cash", "mpesa", "card"], requireShiftForCash: true, allowNegativeStock: true,
  kitchenLateMinutes: 15, receiptHeader: "", receiptFooter: "Thank you!", loyaltyEnabled: true, loyaltyEarnPointsPer100: 1, loyaltyPointValueMinor: 100, qrOrderingEnabled: true, qrAutoSend: true,
};

export const ctx: Ctx = {
  db: null as never, sessionId: "s", sessionKind: "web", terminalId: null, userId: "u1", userName: "Olivia Wanjiru", userColor: "#4338ca", roleKey: "owner", roleName: "Owner", mustChangePassword: false,
  org: { id: "o1", name: "Mama Oliech Kitchen", slug: "mama-oliech", currency: "KES", timezone: "Africa/Nairobi", locale: "en-KE", logoUrl: null, onboardingComplete: true },
  settings, permissions: new Set(ALL_PERMISSIONS), plan: { code: "professional", name: "Professional" }, features: new Set(ALL_FEATURES),
  limits: { branches: 5, users: 30, terminals: 10 },
  subscription: { planCode: "professional", status: "trialing", trialEndsAt: "2026-11-01T00:00:00Z", currentPeriodEnd: null, cancelAtPeriodEnd: false },
  access: { level: "full", reason: "trial_ending", daysLeft: 3 },
  branches: [{ id: "b1", code: "CBD", name: "Nairobi CBD", timezone: "Africa/Nairobi" }, { id: "b2", code: "WLD", name: "Westlands", timezone: "Africa/Nairobi" }],
  activeBranch: { id: "b1", code: "CBD", name: "Nairobi CBD", timezone: "Africa/Nairobi" }, ip: null,
};
export const shellActions = { switchBranch: async () => undefined, logout: async () => undefined };
