export const FEATURES = {
  pos: "Point of sale",
  kitchen: "Kitchen display",
  customers: "Customer profiles",
  multi_branch: "Multiple branches",
  inventory: "Inventory & recipes",
  purchasing: "Suppliers & purchasing",
  loyalty: "Loyalty program",
  displays: "Customer display & signage",
  advanced_reports: "Advanced reports & exports",
  audit_log: "Audit log",
  rooms: "Guest rooms & room service",
} as const;
export type Feature = keyof typeof FEATURES;
export const ALL_FEATURES = Object.keys(FEATURES) as Feature[];

export interface PlanLimits {
  /** `null` = unlimited */
  branches: number | null;
  users: number | null;
  terminals: number | null;
}
export type LimitKey = keyof PlanLimits;

export interface PlanDef {
  code: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  billingInterval: "month" | "year";
  trialDays: number;
  limits: PlanLimits;
  features: Feature[];
  highlights: string[];
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
}

/** Seeded into the `plans` table; platform admins can edit them afterwards. */
export const DEFAULT_PLANS: PlanDef[] = [
  {
    code: "starter", name: "Starter", sortOrder: 1,
    description: "One location ready to run service every day.",
    priceMinor: 4_500_00, currency: "KES", billingInterval: "month", trialDays: 14,
    limits: { branches: 1, users: 5, terminals: 2 },
    features: ["pos", "kitchen", "customers"],
    highlights: ["1 branch · 5 staff · 2 terminals", "POS, kitchen display, customers", "Daily sales reports", "Email support"],
    isPublic: true, isActive: true,
  },
  {
    code: "professional", name: "Professional", sortOrder: 2,
    description: "Growing restaurants with stock, loyalty and several branches.",
    priceMinor: 9_500_00, currency: "KES", billingInterval: "month", trialDays: 14,
    limits: { branches: 5, users: 30, terminals: 10 },
    features: ["pos", "kitchen", "customers", "multi_branch", "inventory", "purchasing", "loyalty", "displays", "advanced_reports", "audit_log", "rooms"],
    highlights: ["Up to 5 branches · 30 staff", "Inventory, recipes & purchasing", "Loyalty & customer display", "Advanced reports & CSV export", "Priority support"],
    isPublic: true, isActive: true,
  },
  {
    code: "enterprise", name: "Enterprise", sortOrder: 3,
    description: "Multi-location groups that need scale and tailored support.",
    priceMinor: 25_000_00, currency: "KES", billingInterval: "month", trialDays: 14,
    limits: { branches: null, users: null, terminals: null },
    features: ["pos", "kitchen", "customers", "multi_branch", "inventory", "purchasing", "loyalty", "displays", "advanced_reports", "audit_log", "rooms"],
    highlights: ["Unlimited branches, staff & terminals", "Everything in Professional", "Dedicated onboarding", "Custom integrations"],
    isPublic: true, isActive: true,
  },
];

export const DEFAULT_TRIAL_PLAN = "professional";
