import { AppShell } from "@/ui/shell/AppShell";
import { ctx, shellActions } from "./fixtures";
import { StaffPage, RolesPage, FloorPage, TerminalsPage } from "@/modules/admin/views/AdminPages";
import { SettingsPage } from "@/modules/admin/views/SettingsPage";
import { BillingPage } from "@/modules/admin/views/BillingPage";
import { PlatformShell, PlatformOrgDetail } from "@/modules/platform-admin/views/PlatformViews";
import { SecurityPage } from "@/modules/platform-admin/views/SecurityViews";
import { PlatformPaystackCard } from "@/modules/payments/views/PlatformPaystackCard";
import { DEFAULT_PLANS } from "@/platform/tenancy/plans";
import { SYSTEM_ROLES } from "@/platform/rbac/roles";

const branches = [{ id: "b1", name: "Nairobi CBD" }, { id: "b2", name: "Westlands" }];
const roles = [{ id: "r1", name: "Manager" }, { id: "r2", name: "Cashier" }];
const staff = [
  { id: "u1", name: "Olivia Wanjiru", email: "olivia@mamaoliech.co.ke", phone: null, roleId: "r0", roleName: "Owner", status: "active" as const, hasPin: true, lastLoginAt: "2026-10-30T07:00:00Z", branchIds: [], isOwner: true },
  { id: "u2", name: "Brian Otieno", email: null, phone: null, roleId: "r2", roleName: "Cashier", status: "active" as const, hasPin: true, lastLoginAt: null, branchIds: ["b1"], isOwner: false },
  { id: "u3", name: "Achieng Auma", email: "achieng@example.com", phone: null, roleId: "r1", roleName: "Manager", status: "disabled" as const, hasPin: false, lastLoginAt: "2026-09-01T07:00:00Z", branchIds: ["b1", "b2"], isOwner: false },
];
const roleRows = SYSTEM_ROLES.slice(0, 3).map((r, i) => ({ id: `r${i}`, key: r.key, name: r.name, description: r.description, isSystem: true, allBranches: r.allBranches, permissions: [...r.permissions] as never[], userCount: i + 1 }))
  .concat([{ id: "rc", key: "custom_x", name: "Host", description: "Seats guests", isSystem: false, allBranches: false, permissions: ["orders.view", "orders.create"] as never[], userCount: 0 }]);
const floor = { areas: [{ id: "a1", name: "Main hall", tables: ["T1", "T2", "T3", "T4"].map((l, i) => ({ id: `t${i}`, label: l, seats: 4, isActive: true })) }, { id: "a2", name: "Patio", tables: [{ id: "p1", label: "P1", seats: 2, isActive: true }] }], unassigned: [] };
const S = (el: React.ReactNode) => () => <AppShell ctx={ctx} actions={shellActions}>{el}</AppShell>;
const orgDetail = {
  org: { id: "org_01J9ZX3K", name: "Mama Oliech Kitchen", slug: "mama-oliech", status: "active", planCode: "professional", subStatus: "active", trialEndsAt: null, currentPeriodEnd: "2026-11-30T00:00:00Z", ownerEmail: "olivia@mamaoliech.co.ke", userCount: 4, branchCount: 2, orders30d: 812, createdAt: "2026-06-01T08:00:00Z" },
  currency: "KES", payments: [], owners: [{ name: "Olivia Wanjiru", email: "olivia@mamaoliech.co.ke", lastLoginAt: "2026-10-31T07:00:00Z" }], audit: [],
} as never;
const ev = (i: number, type: string, ip: string, detail: string, path: string | null = null) => ({ id: `e${i}`, type, ip, userAgent: "python-requests/2.31", path, detail, createdAt: `2026-11-01T0${i}:1${i}:00Z` }) as never;
export const pages = {
  "platform-security": { path: "/platform/security", width: 1280, el: () => <PlatformShell name="Super Admin" logout={null}><SecurityPage twoFactor={{ enabled: false, recoveryLeft: 0 }} allowList={false}
    bans={[{ id: "185.220.101.4", until: "2026-11-02T08:00:00Z", reason: "Probed trap URL (/.env)", source: "auto", active: true }, { id: "45.155.205.9", until: "2026-11-01T09:30:00Z", reason: "Filled the hidden honeypot field", source: "auto", active: true }]}
    events={[ev(5, "trap_url", "185.220.101.4", "GET", "/.env"), ev(4, "ban", "185.220.101.4", "Probed trap URL (/.env) (1440 min, auto)"), ev(3, "honeypot_form", "45.155.205.9", "filled"), ev(2, "canary_login", "45.155.205.9", "admin@restaurant.co.ke"), ev(1, "bad_signature", "203.0.113.50", "", "webhook:platform")]} /></PlatformShell> },
  "platform-home-paystack": { path: "/platform", width: 1280, el: () => <PlatformShell name="Super Admin" logout={null}><PlatformPaystackCard info={{ configured: true, mode: "live", callbackUrl: "https://pos.example.com/pay/paystack/return", webhookUrl: "https://pos.example.com/api/webhooks/paystack" }} /></PlatformShell> },
  "platform-org": { path: "/platform/orgs/org_01J9ZX3K", width: 1280, el: () => <PlatformShell name="Super Admin" logout={null}><PlatformOrgDetail data={orgDetail} plans={[{ code: "professional", name: "Professional" }]} gateway={{ configured: true, enabled: true, publicKey: "pk_live_9f3a1c7e2b8d4f60", secretHint: "••••c41e", mode: "live", webhookUrl: "https://pos.example.com/api/webhooks/paystack/org_01J9ZX3K", returnUrl: "https://pos.example.com/pay/paystack/return" }} /></PlatformShell> },
  "admin-staff": { path: "/app/staff", el: S(<StaffPage staff={staff} roles={roles} branches={branches} origin="https://app.example.com" meId="u1" />) },
  "admin-roles": { path: "/app/roles", el: S(<RolesPage roles={roleRows} />) },
  "admin-floor": { path: "/app/floor", el: S(<FloorPage branchId="b1" branchName="Nairobi CBD" floor={floor} />) },
  "admin-devices": { path: "/app/terminals", el: S(<TerminalsPage branches={branches} terminals={[{ id: "t1", branchId: "b1", branchName: "Nairobi CBD", name: "Front counter", kind: "pos", isActive: true, pairedAt: "2026-10-01T00:00:00Z", lastSeenAt: null }, { id: "t2", branchId: "b1", branchName: "Nairobi CBD", name: "Kitchen screen", kind: "kds", isActive: true, pairedAt: null, lastSeenAt: null }]} />) },
  "admin-settings": { path: "/app/settings", el: S(<SettingsPage org={{ name: "Mama Oliech Kitchen", currency: "KES", timezone: "Africa/Nairobi" }} settings={ctx.settings} gateway={{ enabled: true, mode: "live" }} />) },
  "admin-billing": { path: "/app/billing", el: S(<BillingPage paystack plans={DEFAULT_PLANS} current="professional" status="trialing" trialEndsAt="2026-11-02T00:00:00Z" periodEnd={null} pendingTo={null} usage={{ users: 4, branches: 2, terminals: 1 }} timezone="Africa/Nairobi" />) },
};
