import { ALL_PERMISSIONS, type Permission } from "./permissions";

export interface SystemRoleDef {
  key: string;
  name: string;
  description: string;
  allBranches: boolean;
  permissions: readonly Permission[];
  /** Where this role lands after sign-in. */
  home: "/app" | "/pos" | "/kitchen" | "/app/inventory";
}

const without = (drop: Permission[]): Permission[] => ALL_PERMISSIONS.filter((p) => !drop.includes(p));

/**
 * Built-in roles. Their permission sets are code, not data: shipping a new
 * capability means editing this file and running `syncSystemRoles` on deploy —
 * never a hidden write on the request path.
 */
export const SYSTEM_ROLES: readonly SystemRoleDef[] = [
  {
    key: "owner", name: "Owner", home: "/app", allBranches: true,
    description: "Full control of the business, including billing and roles.",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "manager", name: "Manager", home: "/app", allBranches: false,
    description: "Runs a branch day to day: orders, menu, stock, staff and reports.",
    permissions: without(["billing.manage", "roles.manage", "branches.manage", "settings.manage"]),
  },
  {
    key: "cashier", name: "Cashier", home: "/pos", allBranches: false,
    description: "Takes orders and payments and runs a cash shift.",
    permissions: ["orders.view", "orders.create", "orders.edit", "payments.collect", "shifts.manage", "menu.view", "menu.availability", "customers.view", "customers.manage", "kitchen.view"],
  },
  {
    key: "waiter", name: "Waiter", home: "/pos", allBranches: false,
    description: "Takes and edits orders on the floor. Cannot take payments.",
    permissions: ["orders.view", "orders.create", "orders.edit", "menu.view", "customers.view", "kitchen.view"],
  },
  {
    key: "receptionist", name: "Receptionist", home: "/app", allBranches: false,
    description: "Books rooms, checks guests in and out and takes room payments.",
    permissions: ["rooms.view", "bookings.manage", "orders.view", "menu.view", "customers.view"],
  },
  {
    key: "kitchen", name: "Kitchen", home: "/kitchen", allBranches: false,
    description: "Works the kitchen display.",
    permissions: ["kitchen.view", "kitchen.operate", "menu.view", "menu.availability"],
  },
  {
    key: "storekeeper", name: "Storekeeper", home: "/app/inventory", allBranches: false,
    description: "Manages stock, suppliers, purchasing and receiving.",
    permissions: ["inventory.view", "inventory.manage", "inventory.adjust", "purchasing.view", "purchasing.manage", "purchasing.receive", "menu.view"],
  },
  {
    key: "accountant", name: "Accountant", home: "/app", allBranches: true,
    description: "Read-only access to financial reports, shifts and the audit log.",
    permissions: ["dashboard.view", "reports.view", "reports.financial", "reports.export", "shifts.view_all", "orders.view", "inventory.view", "purchasing.view", "audit.view", "billing.manage"],
  },
];

export const SYSTEM_ROLE_KEYS = SYSTEM_ROLES.map((r) => r.key);
export const getSystemRole = (key: string): SystemRoleDef | undefined => SYSTEM_ROLES.find((r) => r.key === key);
