import type { Ctx } from "@/platform/auth/context";
import type { Db, Doc, Filter } from "@/platform/db";
import { byIds } from "@/platform/db";
import { audit } from "@/platform/audit/audit";
import { newId, newSecret } from "@/platform/ids";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { hashSecret, passwordProblem } from "@/platform/auth/password";
import { hashToken, newToken } from "@/platform/auth/tokens";
import { revokeAllSessions } from "@/platform/auth/sessions";
import { assertWithinLimit } from "@/platform/tenancy/entitlements";
import { isPermission, type Permission } from "@/platform/rbac/permissions";
import { requireBranch } from "@/platform/rbac/guard";
import { createTerminalPairing, setUserPin } from "@/modules/identity/auth.service";
import { nowIso } from "@/platform/dates";
import { z } from "zod";
import type { areaSchema, branchSchema, inviteSchema, orgProfileSchema, roleSchema, settingsSchema, staffSchema, tableSchema, terminalSchema } from "./schema";

type In<T extends z.ZodTypeAny> = z.infer<T>;
const lower = (s: string) => s.trim().toLowerCase();

/* ------------------------------------------------------------------ floor */
export interface FloorArea { id: string; name: string; tables: { id: string; label: string; seats: number; isActive: boolean }[] }
export async function getFloor(ctx: Ctx, branchId: string): Promise<{ areas: FloorArea[]; unassigned: FloorArea["tables"] }> {
  requireBranch(ctx, branchId);
  const [areas, tables] = await Promise.all([
    ctx.db.col<Doc & { name: string; sortOrder: number }>("floorAreas").find({ orgId: ctx.org.id, branchId }),
    ctx.db.col<Doc & { areaId: string | null; label: string; seats: number; isActive: boolean; sortOrder: number }>("diningTables").find({ orgId: ctx.org.id, branchId, isActive: true }),
  ]);
  tables.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.label.localeCompare(b.label));
  areas.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.name.localeCompare(b.name));
  const pick = (a: string | null) => tables.filter((t) => (t.areaId ?? null) === a).map((t) => ({ id: t.id, label: t.label, seats: Number(t.seats), isActive: t.isActive }));
  return { areas: areas.map((a) => ({ id: a.id, name: a.name, tables: pick(a.id) })), unassigned: pick(null) };
}
export async function saveArea(ctx: Ctx, i: In<typeof areaSchema>): Promise<{ id: string }> {
  requireBranch(ctx, i.branchId);
  if (i.id) { await ctx.db.col("floorAreas").update({ orgId: ctx.org.id, id: i.id }, { $set: { name: i.name } }); return { id: i.id }; }
  const id = newId("area");
  await ctx.db.col("floorAreas").insert({ id, orgId: ctx.org.id, branchId: i.branchId, name: i.name, sortOrder: await ctx.db.col("floorAreas").count({ orgId: ctx.org.id, branchId: i.branchId }) });
  return { id };
}
export async function deleteArea(ctx: Ctx, id: string): Promise<void> {
  await ctx.db.col("diningTables").update({ orgId: ctx.org.id, areaId: id }, { $set: { areaId: null } });
  await ctx.db.col("floorAreas").delete({ orgId: ctx.org.id, id });
}
export async function saveTable(ctx: Ctx, i: In<typeof tableSchema>): Promise<{ id: string }> {
  requireBranch(ctx, i.branchId);
  const here = await ctx.db.col<Doc & { label: string }>("diningTables").find({ orgId: ctx.org.id, branchId: i.branchId });
  if (here.some((t) => t.id !== i.id && lower(t.label) === lower(i.label))) throw new ConflictError(`A table called "${i.label}" already exists in this branch.`);
  if (i.id) { await ctx.db.col("diningTables").update({ orgId: ctx.org.id, id: i.id }, { $set: { label: i.label, seats: i.seats, areaId: i.areaId ?? null } }); return { id: i.id }; }
  const id = newId("table");
  await ctx.db.col("diningTables").insert({ id, orgId: ctx.org.id, branchId: i.branchId, areaId: i.areaId ?? null, label: i.label, seats: i.seats, isActive: true, sortOrder: here.length });
  return { id };
}
/** Tables with history are retired (hidden), never deleted, so old orders keep their label. */
export async function removeTable(ctx: Ctx, id: string): Promise<void> {
  const open = await ctx.db.col("orders").findOne({ orgId: ctx.org.id, tableId: id, status: "open" });
  if (open) throw new BusinessRuleError("This table has an open order.");
  const t = await ctx.db.col<Doc & { label: string }>("diningTables").findOne({ orgId: ctx.org.id, id });
  if (!t) throw new NotFoundError("Table");
  await ctx.db.col("diningTables").update({ orgId: ctx.org.id, id }, { $set: { isActive: false, label: `${t.label}~${newSecret(3)}` } });
}

/* ------------------------------------------------------------------ staff */
type UserDoc = Doc & { name: string; email: string | null; emailLower?: string | null; phone: string | null; roleId: string; status: "active" | "disabled"; pinHash: string | null; lastLoginAt: string | null; branchIds: string[] };
export interface StaffRow { id: string; name: string; email: string | null; phone: string | null; roleId: string; roleName: string; status: "active" | "disabled"; hasPin: boolean; lastLoginAt: string | null; branchIds: string[]; isOwner: boolean }
export async function listStaff(ctx: Ctx): Promise<StaffRow[]> {
  const [users, roles] = await Promise.all([ctx.db.col<UserDoc>("users").find({ orgId: ctx.org.id }), ctx.db.col<Doc & { name: string; key: string }>("roles").find({ orgId: ctx.org.id })]);
  const role = new Map(roles.map((r) => [r.id, r]));
  return users.flatMap((u) => {
    const r = role.get(u.roleId);
    return r ? [{ id: u.id, name: u.name, email: u.email ?? null, phone: u.phone ?? null, roleId: u.roleId, roleName: r.name, status: u.status, lastLoginAt: u.lastLoginAt ?? null, hasPin: !!u.pinHash, isOwner: r.key === "owner", branchIds: u.branchIds ?? [] }] : [];
  }).sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name));
}

async function activeUserCount(ctx: Ctx): Promise<number> { return ctx.db.col("users").count({ orgId: ctx.org.id, status: "active" }); }

async function checkRoleAndBranches(ctx: Ctx, roleId: string, branchIds: string[]) {
  const role = await ctx.db.col<Doc & { key: string; allBranches: boolean }>("roles").findOne({ orgId: ctx.org.id, id: roleId });
  if (!role) throw new NotFoundError("Role");
  if (role.key === "owner" && ctx.roleKey !== "owner") throw new BusinessRuleError("Only an owner can create another owner.");
  if (branchIds.length) {
    const ok = await ctx.db.col("branches").count({ orgId: ctx.org.id, id: { $in: branchIds } });
    if (ok !== new Set(branchIds).size) throw new NotFoundError("Branch");
  }
  if (!role.allBranches && !branchIds.length) throw new ValidationError("Assign at least one branch.", { branchIds: ["Pick at least one branch."] });
  return role;
}

export async function saveStaff(ctx: Ctx, i: In<typeof staffSchema>): Promise<{ id: string }> {
  const role = await checkRoleAndBranches(ctx, i.roleId, i.branchIds);
  const now = nowIso();
  if (!i.email && !i.pin) throw new ValidationError("Give the person an email (for back-office sign-in) or a PIN (for the POS).", { email: ["Email or PIN is required."] });
  const users = ctx.db.col<UserDoc>("users");
  if (i.email) {
    const dup = await users.findOne({ emailLower: lower(i.email), id: { $ne: i.id ?? "" } });
    if (dup) throw new ConflictError("That email is already used by another account.");
  }
  const branchIds = [...new Set(i.branchIds)];
  let id = i.id;
  if (id) {
    const cur = await users.findOne({ orgId: ctx.org.id, id });
    if (!cur) throw new NotFoundError("Staff member");
    const curRole = await ctx.db.col<Doc & { key: string }>("roles").findOne({ orgId: ctx.org.id, id: cur.roleId });
    const curKey = curRole?.key ?? "";
    if (curKey === "owner" && ctx.roleKey !== "owner") throw new BusinessRuleError("Only an owner can change an owner.");
    if (curKey === "owner" && role.key !== "owner") {
      const ownerRole = await ctx.db.col("roles").findOne({ orgId: ctx.org.id, key: "owner" });
      const owners = ownerRole ? await users.count({ orgId: ctx.org.id, roleId: ownerRole.id, status: "active" }) : 0;
      if (owners <= 1) throw new BusinessRuleError("An organisation needs at least one active owner.");
    }
    await users.update({ orgId: ctx.org.id, id }, { $set: { name: i.name, email: i.email ?? null, emailLower: i.email ? lower(i.email) : null, phone: i.phone ?? null, roleId: i.roleId, branchIds, updatedAt: now } });
    if (curKey !== role.key) await revokeAllSessions(ctx.db, id);
  } else {
    assertWithinLimit(ctx.limits, "users", await activeUserCount(ctx), "staff accounts");
    if (i.email && !i.password && !i.pin) throw new ValidationError("Set a temporary password.", { password: ["A temporary password is required."] });
    id = newId("user");
    await users.insert({ id, orgId: ctx.org.id, roleId: i.roleId, name: i.name, email: i.email ?? null, emailLower: i.email ? lower(i.email) : null, phone: i.phone ?? null, pinHash: i.pin ? await hashSecret(i.pin) : null, mustChangePassword: !!i.email && !!i.password, color: pickColor(id), branchIds, status: "active", createdAt: now, updatedAt: now } as never);
  }
  if (i.password) {
    const problem = passwordProblem(i.password);
    if (problem) throw new ValidationError(problem, { password: [problem] });
    await users.update({ orgId: ctx.org.id, id }, { $set: { passwordHash: await hashSecret(i.password), mustChangePassword: true } });
    await revokeAllSessions(ctx.db, id);
  }
  if (i.pin) await setUserPin(ctx.db, ctx.org.id, id, i.pin);
  await audit(ctx, { action: i.id ? "staff.update" : "staff.create", entityType: "user", entityId: id, summary: `${i.id ? "Updated" : "Added"} ${i.name} (${role.key})` });
  return { id };
}
const COLORS = ["#4338ca", "#0891b2", "#059669", "#d97706", "#db2777", "#7c3aed", "#dc2626", "#2563eb"];
const pickColor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]!;

export async function setStaffStatus(ctx: Ctx, id: string, status: "active" | "disabled"): Promise<void> {
  if (id === ctx.userId && status === "disabled") throw new BusinessRuleError("You can't disable your own account.");
  const u = await ctx.db.col<UserDoc>("users").findOne({ orgId: ctx.org.id, id });
  if (!u) throw new NotFoundError("Staff member");
  if (status === "active") assertWithinLimit(ctx.limits, "users", await activeUserCount(ctx), "staff accounts");
  await ctx.db.col("users").update({ orgId: ctx.org.id, id }, { $set: { status, updatedAt: nowIso() } });
  if (status === "disabled") await revokeAllSessions(ctx.db, id);
  await audit(ctx, { action: `staff.${status}`, entityType: "user", entityId: id, summary: `${status === "disabled" ? "Disabled" : "Re-enabled"} ${u.name}` });
}

/* ------------------------------------------------------------------ invitations */
export async function createInvitation(ctx: Ctx, i: In<typeof inviteSchema>): Promise<{ token: string; email: string; orgName: string }> {
  await checkRoleAndBranches(ctx, i.roleId, i.branchIds);
  const email = lower(i.email);
  if (await ctx.db.col("users").findOne({ emailLower: email })) throw new ConflictError("That email already has an account.");
  assertWithinLimit(ctx.limits, "users", await activeUserCount(ctx), "staff accounts");
  await ctx.db.col("invitations").delete({ orgId: ctx.org.id, emailLower: email, acceptedAt: null });
  const { token, hash } = newToken();
  await ctx.db.col("invitations").insert({ id: newId("invite"), orgId: ctx.org.id, email: i.email, emailLower: email, name: i.name ?? null, roleId: i.roleId, branchIds: i.branchIds, tokenHash: hash, acceptedAt: null, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), invitedBy: ctx.userId, createdAt: nowIso() });
  await audit(ctx, { action: "staff.invite", entityType: "invitation", summary: `Invited ${i.email}` });
  return { token, email: i.email, orgName: ctx.org.name };
}
type InviteDoc = Doc & { orgId: string; email: string; name: string | null; roleId: string; branchIds: string[] };
async function findInvite(db: Db, token: string): Promise<InviteDoc | null> {
  return db.col<InviteDoc>("invitations").findOne({ tokenHash: hashToken(token), acceptedAt: null, expiresAt: { $gt: nowIso() } });
}
export async function previewInvitation(db: Db, token: string): Promise<{ orgName: string; email: string; name: string | null; roleName: string } | null> {
  const inv = await findInvite(db, token);
  if (!inv) return null;
  const [org, role] = await Promise.all([db.col<Doc & { name: string }>("organizations").findOne({ id: inv.orgId }), db.col<Doc & { name: string }>("roles").findOne({ orgId: inv.orgId, id: inv.roleId })]);
  return org && role ? { orgName: org.name, email: inv.email, name: inv.name ?? null, roleName: role.name } : null;
}
export async function acceptInvitation(db: Db, input: { token: string; name: string; password: string }): Promise<{ email: string }> {
  const problem = passwordProblem(input.password);
  if (problem) throw new ValidationError(problem, { password: [problem] });
  return db.tx(async (tx) => {
    const inv = await findInvite(tx, input.token);
    if (!inv) throw new BusinessRuleError("This invitation is invalid or has expired. Ask for a new one.");
    if (await tx.col("users").findOne({ emailLower: lower(inv.email) })) throw new ConflictError("That email already has an account.");
    const id = newId("user"); const now = nowIso();
    await tx.col("users").insert({ id, orgId: inv.orgId, roleId: inv.roleId, name: input.name, email: inv.email, emailLower: lower(inv.email), passwordHash: await hashSecret(input.password), color: pickColor(id), branchIds: inv.branchIds ?? [], status: "active", createdAt: now, updatedAt: now });
    await tx.col("invitations").update({ id: inv.id }, { $set: { acceptedAt: now } });
    return { email: inv.email };
  });
}

/* ------------------------------------------------------------------ roles */
export interface RoleRow { id: string; key: string; name: string; description: string; isSystem: boolean; allBranches: boolean; permissions: Permission[]; userCount: number }
export async function listRoles(ctx: Ctx): Promise<RoleRow[]> {
  const [roles, users] = await Promise.all([ctx.db.col<Doc & { key: string; name: string; description: string; isSystem: boolean; allBranches: boolean; permissions: string[] }>("roles").find({ orgId: ctx.org.id }), ctx.db.col<UserDoc>("users").find({ orgId: ctx.org.id })]);
  const counts = new Map<string, number>();
  for (const u of users) counts.set(u.roleId, (counts.get(u.roleId) ?? 0) + 1);
  return roles.sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name))
    .map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description ?? "", isSystem: r.isSystem, allBranches: r.allBranches, permissions: [...(r.permissions ?? [])].filter(isPermission).sort() as Permission[], userCount: counts.get(r.id) ?? 0 }));
}
export async function saveRole(ctx: Ctx, i: In<typeof roleSchema>): Promise<{ id: string }> {
  const perms = [...new Set(i.permissions)].filter(isPermission).sort();
  // No privilege escalation: you can only hand out permissions you hold yourself.
  const lacking = perms.filter((p) => !ctx.permissions.has(p));
  if (lacking.length) throw new BusinessRuleError(`You can't grant permissions you don't have: ${lacking.slice(0, 3).join(", ")}.`);
  const now = nowIso();
  let id = i.id;
  if (id) {
    const r = await ctx.db.col<Doc & { isSystem: boolean }>("roles").findOne({ orgId: ctx.org.id, id });
    if (!r) throw new NotFoundError("Role");
    if (r.isSystem) throw new BusinessRuleError("Built-in roles can't be edited. Duplicate it as a custom role instead.");
    // Permissions are read on every request, so the change applies immediately — no sign-out needed.
    await ctx.db.col("roles").update({ orgId: ctx.org.id, id }, { $set: { name: i.name, description: i.description ?? "", allBranches: i.allBranches, permissions: perms, updatedAt: now } });
  } else {
    id = newId("role");
    const key = `custom_${newSecret(5).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    await ctx.db.col("roles").insert({ id, orgId: ctx.org.id, key, name: i.name, description: i.description ?? "", isSystem: false, allBranches: i.allBranches, permissions: perms, createdAt: now, updatedAt: now });
  }
  await audit(ctx, { action: i.id ? "role.update" : "role.create", entityType: "role", entityId: id, summary: `${i.id ? "Updated" : "Created"} role ${i.name} (${perms.length} permissions)` });
  return { id };
}
export async function deleteRole(ctx: Ctx, id: string): Promise<void> {
  const r = await ctx.db.col<Doc & { isSystem: boolean; name: string }>("roles").findOne({ orgId: ctx.org.id, id });
  if (!r) throw new NotFoundError("Role");
  if (r.isSystem) throw new BusinessRuleError("Built-in roles can't be deleted.");
  if (await ctx.db.col("users").count({ orgId: ctx.org.id, roleId: id })) throw new BusinessRuleError("Reassign the people in this role first.");
  await ctx.db.col("roles").delete({ orgId: ctx.org.id, id });
  await audit(ctx, { action: "role.delete", entityType: "role", entityId: id, summary: `Deleted role ${r.name}` });
}

/* ------------------------------------------------------------------ branches & terminals */
export interface BranchRow { id: string; code: string; name: string; address: string | null; city: string | null; phone: string | null; timezone: string | null; displayKey: string; isActive: boolean }
export async function listBranches(ctx: Ctx): Promise<BranchRow[]> {
  const rows = await ctx.db.col<Doc & Omit<BranchRow, "id">>("branches").find({ orgId: ctx.org.id });
  return rows.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
    .map((b) => ({ id: b.id, code: b.code, name: b.name, address: b.address ?? null, city: b.city ?? null, phone: b.phone ?? null, timezone: b.timezone ?? null, displayKey: b.displayKey, isActive: b.isActive }));
}
export async function saveBranch(ctx: Ctx, i: In<typeof branchSchema>): Promise<{ id: string }> {
  const now = nowIso();
  const code = i.code.toUpperCase();
  if (await ctx.db.col("branches").findOne({ orgId: ctx.org.id, code, id: { $ne: i.id ?? "" } })) throw new ConflictError(`Branch code "${code}" is already used.`);
  if (i.timezone) { try { new Intl.DateTimeFormat("en", { timeZone: i.timezone }); } catch { throw new ValidationError("Unknown timezone.", { timezone: ["Use an IANA name like Africa/Nairobi."] }); } }
  if (i.id) {
    await ctx.db.col("branches").update({ orgId: ctx.org.id, id: i.id }, { $set: { name: i.name, code, address: i.address ?? null, city: i.city ?? null, phone: i.phone ?? null, timezone: i.timezone ?? null, ...(i.isActive !== undefined ? { isActive: i.isActive } : {}), updatedAt: now } });
    return { id: i.id };
  }
  assertWithinLimit(ctx.limits, "branches", await ctx.db.col("branches").count({ orgId: ctx.org.id, isActive: true }), "branches");
  const id = newId("branch");
  await ctx.db.col("branches").insert({ id, orgId: ctx.org.id, code, name: i.name, address: i.address ?? null, city: i.city ?? null, phone: i.phone ?? null, timezone: i.timezone ?? null, displayKey: newSecret(18), isActive: true, createdAt: now, updatedAt: now });
  await audit(ctx, { action: "branch.create", entityType: "branch", entityId: id, branchId: id, summary: `Created branch ${i.name}` });
  return { id };
}
export interface TerminalRow { id: string; branchId: string; branchName: string; name: string; kind: "pos" | "kds"; isActive: boolean; pairedAt: string | null; lastSeenAt: string | null }
export async function listTerminals(ctx: Ctx): Promise<TerminalRow[]> {
  const terms = await ctx.db.col<Doc & { branchId: string; name: string; kind: "pos" | "kds"; isActive: boolean; pairedAt: string | null; lastSeenAt: string | null }>("terminals").find({ orgId: ctx.org.id });
  const b = await byIds<Doc & { name: string }>(ctx.db, "branches", ctx.org.id, terms.map((t) => t.branchId));
  return terms.flatMap((t) => { const br = b.get(t.branchId); return br ? [{ id: t.id, branchId: t.branchId, branchName: br.name, name: t.name, kind: t.kind, isActive: t.isActive, pairedAt: t.pairedAt ?? null, lastSeenAt: t.lastSeenAt ?? null }] : []; })
    .sort((x, y) => Number(y.isActive) - Number(x.isActive) || x.branchName.localeCompare(y.branchName) || x.name.localeCompare(y.name));
}
export async function pairTerminal(ctx: Ctx, i: In<typeof terminalSchema>): Promise<{ code: string; expiresAt: string }> {
  requireBranch(ctx, i.branchId);
  assertWithinLimit(ctx.limits, "terminals", await ctx.db.col("terminals").count({ orgId: ctx.org.id, isActive: true }), "terminals");
  const r = await createTerminalPairing(ctx.db, { orgId: ctx.org.id, branchId: i.branchId, name: i.name, kind: i.kind });
  await audit(ctx, { action: "terminal.pair", entityType: "terminal", entityId: r.terminalId, branchId: i.branchId, summary: `Created pairing code for ${i.name}` });
  return { code: r.code, expiresAt: r.expiresAt };
}
export async function revokeTerminal(ctx: Ctx, id: string): Promise<void> {
  await ctx.db.col("terminals").update({ orgId: ctx.org.id, id }, { $set: { isActive: false, tokenHash: null, pairingHash: null } });
  await audit(ctx, { action: "terminal.revoke", entityType: "terminal", entityId: id, summary: "Revoked a terminal" });
}

/* ------------------------------------------------------------------ settings, profile, audit, billing */
export async function saveSettings(ctx: Ctx, i: In<typeof settingsSchema>): Promise<void> {
  const types = i.serviceChargeTypes.filter((t) => i.orderTypes.includes(t as never));
  const gw = await ctx.db.col<Doc & { enabled: boolean }>("paymentGateways").findOne({ id: `${ctx.org.id}:paystack` });
  const methods = i.paymentMethods.filter((m) => m !== "paystack" || gw?.enabled);
  if (!methods.length) throw new ValidationError("Enable at least one payment method.", { paymentMethods: ["Enable at least one payment method."] });
  await ctx.db.col("orgSettings").update({ id: ctx.org.id }, { $set: {
    taxLabel: i.taxLabel, taxRateBp: Math.round(i.taxRatePercent * 100), taxInclusive: i.taxInclusive, serviceChargeBp: Math.round(i.serviceChargePercent * 100), serviceChargeTaxable: i.serviceChargeTaxable,
    serviceChargeTypes: types, orderTypes: i.orderTypes, paymentMethods: methods, requireShiftForCash: i.requireShiftForCash,
    allowNegativeStock: i.allowNegativeStock, kitchenLateMinutes: i.kitchenLateMinutes, receiptHeader: i.receiptHeader ?? "", receiptFooter: i.receiptFooter ?? "", updatedAt: nowIso(),
  } });
  await audit(ctx, { action: "settings.update", entityType: "settings", summary: "Changed business settings" });
}
export async function saveOrgProfile(ctx: Ctx, i: In<typeof orgProfileSchema>): Promise<void> {
  try { new Intl.DateTimeFormat("en", { timeZone: i.timezone }); } catch { throw new ValidationError("Unknown timezone.", { timezone: ["Use an IANA name like Africa/Nairobi."] }); }
  await ctx.db.col("organizations").update({ id: ctx.org.id }, { $set: { name: i.name, currency: i.currency.toUpperCase(), timezone: i.timezone, updatedAt: nowIso() } });
  await audit(ctx, { action: "org.update", entityType: "organization", entityId: ctx.org.id, summary: "Updated business profile" });
}
export interface AuditRow { id: string; actorName: string | null; action: string; summary: string; createdAt: string; ip: string | null }
export async function listAudit(ctx: Ctx, opts: { q?: string; limit?: number } = {}): Promise<AuditRow[]> {
  const q = opts.q?.trim().toLowerCase();
  const limit = Math.min(opts.limit ?? 100, 500);
  const filter: Filter = { orgId: ctx.org.id };
  const col = ctx.db.col<Doc & { actorName: string | null; action: string; summary: string; createdAt: string; ip: string | null }>("auditLogs");
  const rows = q ? (await col.find(filter, { sort: { createdAt: -1, id: -1 } })).filter((r) => `${r.summary} ${r.action} ${r.actorName ?? ""}`.toLowerCase().includes(q)).slice(0, limit)
    : await col.find(filter, { sort: { createdAt: -1, id: -1 }, limit });
  return rows.map((r) => ({ id: r.id, actorName: r.actorName ?? null, action: r.action, summary: r.summary, createdAt: r.createdAt, ip: r.ip ?? null }));
}
export async function requestPlanChange(ctx: Ctx, toPlan: string, note?: string | null): Promise<void> {
  const plan = await ctx.db.col<Doc & { code: string }>("plans").findOne({ code: toPlan, isPublic: true });
  if (!plan) throw new NotFoundError("Plan");
  if (plan.code === ctx.plan.code) throw new BusinessRuleError("You are already on this plan.");
  if (await ctx.db.col("planChangeRequests").findOne({ orgId: ctx.org.id, status: "pending" })) throw new ConflictError("You already have a pending plan request.");
  await ctx.db.col("planChangeRequests").insert({ id: newId("planRequest"), orgId: ctx.org.id, fromPlan: ctx.plan.code, toPlan, note: note ?? null, requestedBy: ctx.userId, status: "pending", createdAt: nowIso() });
  await audit(ctx, { action: "billing.request", entityType: "plan", summary: `Requested plan ${toPlan}` });
}

/* ------------------------------------------------------------------ onboarding */
const SAMPLE_MENU: { category: string; color: string; items: [string, number][] }[] = [
  { category: "Mains", color: "#ef4444", items: [["Grilled chicken", 85000], ["Beef stew", 75000], ["Ugali & fish", 95000]] },
  { category: "Sides", color: "#eab308", items: [["Chips", 30000], ["Kachumbari", 15000]] },
  { category: "Drinks", color: "#3b82f6", items: [["Soda", 12000], ["Fresh juice", 25000], ["Dawa tea", 15000]] },
];
export async function completeOnboarding(ctx: Ctx, i: z.infer<typeof import("./schema").onboardingSchema>): Promise<void> {
  if (ctx.org.onboardingComplete) throw new BusinessRuleError("Setup is already complete.");
  await saveOrgProfile(ctx, { name: ctx.org.name, currency: i.currency, timezone: i.timezone });
  await ctx.db.col("orgSettings").update({ id: ctx.org.id }, { $set: { taxRateBp: Math.round(i.taxRatePercent * 100), taxInclusive: i.taxInclusive, updatedAt: nowIso() } });
  const branch = ctx.activeBranch ?? ctx.branches[0];
  if (branch && i.tableCount > 0) {
    for (let n = 1; n <= i.tableCount; n += 1) await saveTable(ctx, { branchId: branch.id, label: `T${n}`, seats: 4 } as never);
  }
  if (i.sampleMenu) {
    const { saveCategory, saveProduct } = await import("@/modules/menu/service");
    for (const [ci, c] of SAMPLE_MENU.entries()) {
      const cat = await saveCategory(ctx, { name: c.category, color: c.color, sortOrder: ci, isActive: true } as never);
      for (const [pi, [name, price]] of c.items.entries()) await saveProduct(ctx, { name, categoryId: cat.id, basePriceMinor: price, isActive: true, isTaxExempt: false, prepMinutes: 10, sortOrder: pi, description: "", variants: [], modifierGroupIds: [] } as never);
    }
  }
  await ctx.db.col("organizations").update({ id: ctx.org.id }, { $set: { onboardingStatus: "completed", updatedAt: nowIso() } });
  await audit(ctx, { action: "org.onboarded", entityType: "organization", entityId: ctx.org.id, summary: "Completed setup" });
}

/* ------------------------------------------------------------------ customer displays */
export interface SlideRow { id: string; branchId: string | null; title: string; body: string; imageUrl: string | null; accent: string; durationS: number; isActive: boolean }
export async function listSlides(ctx: Ctx): Promise<SlideRow[]> {
  const rows = await ctx.db.col<Doc & { branchId: string | null; title: string; body: string; imageUrl: string | null; accent: string; durationS: number; isActive: boolean; sortOrder: number; createdAt: string }>("signageSlides").find({ orgId: ctx.org.id });
  return rows.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || (a.createdAt < b.createdAt ? -1 : 1)).map((r) => ({ id: r.id, branchId: r.branchId ?? null, title: r.title, body: r.body ?? "", imageUrl: r.imageUrl ?? null, accent: r.accent, durationS: Number(r.durationS), isActive: r.isActive }));
}
export async function saveSlide(ctx: Ctx, i: z.infer<typeof import("./schema").slideSchema>): Promise<{ id: string }> {
  if (i.branchId) requireBranch(ctx, i.branchId);
  const data = { branchId: i.branchId ?? null, title: i.title, body: i.body ?? "", imageUrl: i.imageUrl ?? null, accent: i.accent, durationS: i.durationS, ...(i.isActive !== undefined ? { isActive: i.isActive } : {}) };
  if (i.id) { await ctx.db.col("signageSlides").update({ orgId: ctx.org.id, id: i.id }, { $set: data }); return { id: i.id }; }
  const id = newId("slide");
  await ctx.db.col("signageSlides").insert({ id, orgId: ctx.org.id, ...data, isActive: data.isActive ?? true, sortOrder: await ctx.db.col("signageSlides").count({ orgId: ctx.org.id }), createdAt: nowIso() });
  return { id };
}
export async function deleteSlide(ctx: Ctx, id: string): Promise<void> { await ctx.db.col("signageSlides").delete({ orgId: ctx.org.id, id }); }

export interface BoardOrder { number: string; type: string; openedAt: string; items: { name: string; qty: number }[] }
export interface BoardMenuGroup { name: string; items: { id: string; name: string; description: string; priceMinor: number; imageUrl: string | null }[] }
export interface DisplayBoard {
  branchName: string; orgName: string; logoUrl: string | null; city: string | null; currency: string; locale: string; timezone: string;
  waiting: BoardOrder[]; ready: BoardOrder[]; menu: BoardMenuGroup[];
  slides: { id: string; title: string; body: string; imageUrl: string | null; accent: string; durationS: number }[];
}
/** Public (unauthenticated) customer board, addressed by the branch's secret display key. Exposes order numbers, item names and the public menu only: no customer data, no totals. */
export async function getDisplayBoard(db: Db, key: string): Promise<DisplayBoard | null> {
  const b = await db.col<Doc & { orgId: string; name: string; city: string | null; timezone: string | null; isActive: boolean }>("branches").findOne({ displayKey: key, isActive: true });
  if (!b) return null;
  const [org, sub] = await Promise.all([
    db.col<Doc & { name: string; status: string; logoUrl: string | null; currency: string; locale: string; timezone: string }>("organizations").findOne({ id: b.orgId }),
    db.col<Doc & { status: string }>("subscriptions").findOne({ orgId: b.orgId }),
  ]);
  if (!org || org.status !== "active" || !sub || !["trialing", "active", "past_due"].includes(sub.status)) return null;
  const since = new Date(Date.now() - 36 * 3600_000).toISOString().slice(0, 10);
  const orders = await db.col<Doc & { number: string; type: string; openedAt: string }>("orders").find({ orgId: b.orgId, branchId: b.id, status: { $in: ["open", "closed"] }, businessDate: { $gte: since } }, { sort: { openedAt: 1, id: 1 } });
  const items = orders.length ? await db.col<Doc & { orderId: string; name: string; qty: number; status: string }>("orderItems").find({ orgId: b.orgId, orderId: { $in: orders.map((o) => o.id) }, status: { $in: ["sent", "preparing", "ready"] } }) : [];
  const waiting: BoardOrder[] = []; const ready: BoardOrder[] = [];
  for (const o of orders) {
    const its = items.filter((i) => i.orderId === o.id);
    if (!its.length) continue;
    const row: BoardOrder = { number: o.number, type: o.type, openedAt: o.openedAt, items: its.map((i) => ({ name: i.name, qty: Number(i.qty) })) };
    (its.every((i) => i.status === "ready") ? ready : waiting).push(row);
  }
  const [cats, prods, branchRows, slideDocs] = await Promise.all([
    db.col<Doc & { name: string; sortOrder: number; isActive: boolean }>("menuCategories").find({ orgId: b.orgId, isActive: true }),
    db.col<Doc & { categoryId: string; name: string; description: string; imageUrl: string | null; basePriceMinor: number; sortOrder: number }>("products").find({ orgId: b.orgId, isActive: true }),
    db.col<Doc & { productId: string; priceMinor: number | null; isAvailable: boolean }>("branchProducts").find({ orgId: b.orgId, branchId: b.id }),
    db.col<Doc & { branchId: string | null; title: string; body: string; imageUrl: string | null; accent: string; durationS: number; sortOrder: number; createdAt: string }>("signageSlides").find({ orgId: b.orgId, isActive: true }),
  ]);
  const over = new Map(branchRows.map((r) => [r.productId, r]));
  const menu: BoardMenuGroup[] = [...cats].sort((x, y) => Number(x.sortOrder) - Number(y.sortOrder) || x.name.localeCompare(y.name)).map((c) => ({
    name: c.name,
    items: prods.filter((p) => p.categoryId === c.id && over.get(p.id)?.isAvailable !== false)
      .sort((x, y) => Number(x.sortOrder) - Number(y.sortOrder) || x.name.localeCompare(y.name))
      .map((p) => ({ id: p.id, name: p.name, description: p.description ?? "", priceMinor: Number(over.get(p.id)?.priceMinor ?? p.basePriceMinor), imageUrl: p.imageUrl ?? null })),
  })).filter((g) => g.items.length);
  const slides = slideDocs.filter((s) => !s.branchId || s.branchId === b.id).sort((x, y) => Number(x.sortOrder) - Number(y.sortOrder) || (x.createdAt < y.createdAt ? -1 : 1));
  return {
    branchName: b.name, orgName: org.name, logoUrl: org.logoUrl ?? null, city: b.city ?? null, currency: org.currency, locale: org.locale, timezone: b.timezone ?? org.timezone,
    waiting, ready, menu, slides: slides.map((x) => ({ id: x.id, title: x.title, body: x.body ?? "", imageUrl: x.imageUrl ?? null, accent: x.accent, durationS: Number(x.durationS) })),
  };
}
