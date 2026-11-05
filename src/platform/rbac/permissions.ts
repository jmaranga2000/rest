/**
 * The single source of truth for what can be done in the product.
 * A permission is `<area>.<action>`. Nothing checks an ad-hoc string:
 * services and UI both import from here.
 */
export interface PermissionDef {
  key: string;
  label: string;
  description: string;
}
export interface PermissionGroup {
  id: string;
  label: string;
  permissions: PermissionDef[];
}

export const PERMISSION_GROUPS = [
  {
    id: "orders", label: "Orders & POS",
    permissions: [
      { key: "orders.view", label: "View orders", description: "See open and past orders for assigned branches." },
      { key: "orders.create", label: "Take orders", description: "Open orders and add items at the POS." },
      { key: "orders.edit", label: "Edit orders", description: "Change quantities and notes, move tables, attach customers." },
      { key: "orders.discount", label: "Apply discounts", description: "Apply manual discounts to an order." },
      { key: "orders.void", label: "Void items & orders", description: "Remove sent items or cancel an order (reason required)." },
    ],
  },
  {
    id: "payments", label: "Payments & cash",
    permissions: [
      { key: "payments.collect", label: "Collect payments", description: "Take cash, M-Pesa, card and other tenders." },
      { key: "payments.refund", label: "Refund payments", description: "Reverse a payment against a closed or open order." },
      { key: "shifts.manage", label: "Run own cash shift", description: "Open and close a cash drawer shift; record pay-ins and pay-outs." },
      { key: "shifts.view_all", label: "View all shifts", description: "Review every cashier's shifts and variances." },
    ],
  },
  {
    id: "kitchen", label: "Kitchen",
    permissions: [
      { key: "kitchen.view", label: "View kitchen board", description: "See tickets on the kitchen display." },
      { key: "kitchen.operate", label: "Update ticket status", description: "Start, finish and bump kitchen items." },
    ],
  },
  {
    id: "menu", label: "Menu & floor",
    permissions: [
      { key: "menu.view", label: "View menu", description: "Browse categories, items and modifiers." },
      { key: "menu.manage", label: "Manage menu", description: "Create and edit categories, items, modifiers and prices, including uploading product photos." },
      { key: "menu.availability", label: "Toggle availability", description: "Mark items sold-out (86) for a branch." },
      { key: "floor.manage", label: "Manage floor plan", description: "Edit areas and tables." },
    ],
  },
  {
    id: "inventory", label: "Inventory & purchasing",
    permissions: [
      { key: "inventory.view", label: "View inventory", description: "See stock levels and movement history." },
      { key: "inventory.manage", label: "Manage stock items & recipes", description: "Create items, set reorder levels and edit recipes." },
      { key: "inventory.adjust", label: "Adjust & count stock", description: "Post adjustments, waste and stock counts." },
      { key: "purchasing.view", label: "View purchasing", description: "See suppliers and purchase orders." },
      { key: "purchasing.manage", label: "Manage purchasing", description: "Create suppliers and purchase orders." },
      { key: "purchasing.receive", label: "Receive stock", description: "Book goods received against a purchase order." },
    ],
  },
  {
    id: "customers", label: "Customers & loyalty",
    permissions: [
      { key: "customers.view", label: "View customers", description: "Search the customer directory." },
      { key: "customers.manage", label: "Manage customers", description: "Create, edit and adjust customer records." },
      { key: "loyalty.manage", label: "Manage loyalty program", description: "Edit rewards and earning rules." },
    ],
  },
  {
    id: "insights", label: "Reports",
    permissions: [
      { key: "dashboard.view", label: "View dashboard", description: "Open the business overview." },
      { key: "reports.view", label: "View reports", description: "Operational sales and product reports." },
      { key: "reports.financial", label: "View financial reports", description: "Revenue totals, tax, cost and margins across branches." },
      { key: "reports.export", label: "Export data", description: "Download CSV exports." },
    ],
  },
  {
    id: "rooms", label: "Guest rooms",
    permissions: [
      { key: "rooms.view", label: "View rooms & bookings", description: "See rooms, availability, bookings and guest folios." },
      { key: "rooms.manage", label: "Manage rooms", description: "Create room types and rooms, set rates, print room QR codes." },
      { key: "bookings.manage", label: "Manage bookings", description: "Create, check in, check out and cancel bookings; take room payments." },
    ],
  },
  {
    id: "admin", label: "Administration",
    permissions: [
      { key: "staff.view", label: "View staff", description: "See the staff directory." },
      { key: "staff.manage", label: "Manage staff", description: "Invite staff by email, edit and deactivate staff; reset PINs and passwords." },
      { key: "roles.manage", label: "Manage roles", description: "Create custom roles and edit their permissions." },
      { key: "branches.manage", label: "Manage branches", description: "Create and edit branches." },
      { key: "terminals.manage", label: "Manage terminals", description: "Pair POS and kitchen devices." },
      { key: "displays.manage", label: "Manage displays", description: "Edit customer-display content." },
      { key: "settings.manage", label: "Manage settings", description: "Tax, service charge, payment methods and receipts." },
      { key: "billing.manage", label: "Manage subscription", description: "View invoices and request plan changes." },
      { key: "audit.view", label: "View audit log", description: "Review who changed what, and when." },
    ],
  },
] as const satisfies readonly PermissionGroup[];

type Keys<G> = G extends { permissions: readonly { key: infer K }[] } ? K : never;
export type Permission = Keys<(typeof PERMISSION_GROUPS)[number]>;

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key as Permission));
const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);
export const isPermission = (v: string): v is Permission => PERMISSION_SET.has(v);

export const permissionLabel = (key: string): string =>
  PERMISSION_GROUPS.flatMap((g) => g.permissions as readonly PermissionDef[]).find((p) => p.key === key)?.label ?? key;
