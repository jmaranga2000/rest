import type { Permission } from "@/platform/rbac/permissions";
import type { Feature } from "@/platform/tenancy/plans";

export type NavIconName =
  | "armchair" | "chart" | "chef" | "credit-card" | "gift" | "dashboard" | "package" | "receipt" | "scroll" | "settings"
  | "shield" | "store" | "tablet" | "truck" | "tv" | "user-cog" | "users" | "utensils" | "wallet" | "shopping-bag" | "bed";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIconName;
  /** The item shows when the user holds ANY of these. */
  anyOf?: Permission[];
  feature?: Feature;
  /** Opens a full-screen workspace rather than a page inside the shell. */
  external?: boolean;
}
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Overview", items: [
    { label: "Dashboard", href: "/app", icon: "dashboard", anyOf: ["dashboard.view"] },
  ] },
  { label: "Service", items: [
    { label: "Point of sale", href: "/pos", icon: "shopping-bag", anyOf: ["orders.create"], feature: "pos", external: true },
    { label: "Kitchen display", href: "/kitchen", icon: "chef", anyOf: ["kitchen.view"], feature: "kitchen", external: true },
    { label: "Orders", href: "/app/orders", icon: "receipt", anyOf: ["orders.view"], feature: "pos" },
    { label: "Cash shifts", href: "/app/shifts", icon: "wallet", anyOf: ["shifts.manage", "shifts.view_all"], feature: "pos" },
  ] },
  { label: "Catalogue", items: [
    { label: "Menu", href: "/app/menu", icon: "utensils", anyOf: ["menu.view", "menu.manage"] },
    { label: "Tables & floor", href: "/app/floor", icon: "armchair", anyOf: ["floor.manage"] },
  ] },
  { label: "Hotel", items: [
    { label: "Rooms", href: "/app/rooms", icon: "bed", anyOf: ["rooms.view", "rooms.manage"], feature: "rooms" },
  ] },
  { label: "Stock", items: [
    { label: "Inventory", href: "/app/inventory", icon: "package", anyOf: ["inventory.view"], feature: "inventory" },
    { label: "Purchasing", href: "/app/purchasing", icon: "truck", anyOf: ["purchasing.view"], feature: "purchasing" },
  ] },
  { label: "Customers", items: [
    { label: "Customers", href: "/app/customers", icon: "users", anyOf: ["customers.view"], feature: "customers" },
    { label: "Loyalty", href: "/app/loyalty", icon: "gift", anyOf: ["loyalty.manage"], feature: "loyalty" },
  ] },
  { label: "Insights", items: [
    { label: "Reports", href: "/app/reports", icon: "chart", anyOf: ["reports.view"] },
  ] },
  { label: "Administration", items: [
    { label: "Staff", href: "/app/staff", icon: "user-cog", anyOf: ["staff.view"] },
    { label: "Roles", href: "/app/roles", icon: "shield", anyOf: ["roles.manage"] },
    { label: "Branches", href: "/app/branches", icon: "store", anyOf: ["branches.manage"] },
    { label: "Terminals", href: "/app/terminals", icon: "tablet", anyOf: ["terminals.manage"] },
    { label: "Displays", href: "/app/displays", icon: "tv", anyOf: ["displays.manage"], feature: "displays" },
    { label: "Audit log", href: "/app/audit", icon: "scroll", anyOf: ["audit.view"], feature: "audit_log" },
    { label: "Billing", href: "/app/billing", icon: "credit-card", anyOf: ["billing.manage"] },
    { label: "Settings", href: "/app/settings", icon: "settings", anyOf: ["settings.manage"] },
  ] },
];

/** Items the user can open. Plan-gated items stay visible (locked) so upgrades are discoverable. */
export function visibleNav(permissions: ReadonlySet<Permission>, features: ReadonlySet<Feature>): (NavGroup & { items: (NavItem & { locked: boolean })[] })[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => !i.anyOf || i.anyOf.some((p) => permissions.has(p)))
      .map((i) => ({ ...i, locked: !!i.feature && !features.has(i.feature) })),
  })).filter((g) => g.items.length > 0);
}
