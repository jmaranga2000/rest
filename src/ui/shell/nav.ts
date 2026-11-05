import type { IconType } from "react-icons";
import {
  LuArmchair, LuChartColumn, LuChefHat, LuCreditCard, LuGift, LuLayoutDashboard, LuPackage, LuReceipt, LuScrollText, LuSettings,
  LuShieldCheck, LuStore, LuTablet, LuTruck, LuTv, LuUserCog, LuUsers, LuUtensilsCrossed, LuWallet, LuShoppingBag, LuBedDouble,
} from "react-icons/lu";
import type { Permission } from "@/platform/rbac/permissions";
import type { Feature } from "@/platform/tenancy/plans";

export interface NavItem {
  label: string;
  href: string;
  icon: IconType;
  /** The item shows when the user holds ANY of these. */
  anyOf?: Permission[];
  feature?: Feature;
  /** Opens a full-screen workspace rather than a page inside the shell. */
  external?: boolean;
}
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Overview", items: [
    { label: "Dashboard", href: "/app", icon: LuLayoutDashboard, anyOf: ["dashboard.view"] },
  ] },
  { label: "Service", items: [
    { label: "Point of sale", href: "/pos", icon: LuShoppingBag, anyOf: ["orders.create"], feature: "pos", external: true },
    { label: "Kitchen display", href: "/kitchen", icon: LuChefHat, anyOf: ["kitchen.view"], feature: "kitchen", external: true },
    { label: "Orders", href: "/app/orders", icon: LuReceipt, anyOf: ["orders.view"], feature: "pos" },
    { label: "Cash shifts", href: "/app/shifts", icon: LuWallet, anyOf: ["shifts.manage", "shifts.view_all"], feature: "pos" },
  ] },
  { label: "Catalogue", items: [
    { label: "Menu", href: "/app/menu", icon: LuUtensilsCrossed, anyOf: ["menu.view", "menu.manage"] },
    { label: "Tables & floor", href: "/app/floor", icon: LuArmchair, anyOf: ["floor.manage"] },
  ] },
  { label: "Hotel", items: [
    { label: "Rooms", href: "/app/rooms", icon: LuBedDouble, anyOf: ["rooms.view", "rooms.manage"], feature: "rooms" },
  ] },
  { label: "Stock", items: [
    { label: "Inventory", href: "/app/inventory", icon: LuPackage, anyOf: ["inventory.view"], feature: "inventory" },
    { label: "Purchasing", href: "/app/purchasing", icon: LuTruck, anyOf: ["purchasing.view"], feature: "purchasing" },
  ] },
  { label: "Customers", items: [
    { label: "Customers", href: "/app/customers", icon: LuUsers, anyOf: ["customers.view"], feature: "customers" },
    { label: "Loyalty", href: "/app/loyalty", icon: LuGift, anyOf: ["loyalty.manage"], feature: "loyalty" },
  ] },
  { label: "Insights", items: [
    { label: "Reports", href: "/app/reports", icon: LuChartColumn, anyOf: ["reports.view"] },
  ] },
  { label: "Administration", items: [
    { label: "Staff", href: "/app/staff", icon: LuUserCog, anyOf: ["staff.view"] },
    { label: "Roles", href: "/app/roles", icon: LuShieldCheck, anyOf: ["roles.manage"] },
    { label: "Branches", href: "/app/branches", icon: LuStore, anyOf: ["branches.manage"] },
    { label: "Terminals", href: "/app/terminals", icon: LuTablet, anyOf: ["terminals.manage"] },
    { label: "Displays", href: "/app/displays", icon: LuTv, anyOf: ["displays.manage"], feature: "displays" },
    { label: "Audit log", href: "/app/audit", icon: LuScrollText, anyOf: ["audit.view"], feature: "audit_log" },
    { label: "Billing", href: "/app/billing", icon: LuCreditCard, anyOf: ["billing.manage"] },
    { label: "Settings", href: "/app/settings", icon: LuSettings, anyOf: ["settings.manage"] },
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
