import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTenant, createTestDb } from "./helpers";
import { loginWithPassword, createTerminalPairing, claimTerminalPairing, loginWithPin, setUserPin, listPinUsers, getTerminalByToken } from "@/modules/identity/auth.service";
import { loadContext } from "@/platform/auth/context";
import { newId } from "@/platform/ids";
import { nextCounter } from "@/platform/db";
import { consumeRateLimit } from "@/platform/auth/rate-limit";
import { revokeAllSessions } from "@/platform/auth/sessions";
import { requirePermission, requireBranch } from "@/platform/rbac/guard";
import { provisionOrganization } from "@/modules/organizations/provision";
import { hashSecret } from "@/platform/auth/password";

describe("provisioning", () => {
  it("creates a usable tenant: roles, settings, trial, owner context", async () => {
    const t = await createTenant();
    assert.equal(t.owner.roleKey, "owner");
    assert.equal(t.owner.subscription.status, "trialing");
    assert.equal(t.owner.access.level, "full");
    assert.ok(t.owner.features.has("inventory"));
    assert.equal(t.owner.settings.taxRateBp, 1600);
    assert.equal(t.owner.branches.length, 1);
    assert.equal(t.owner.activeBranch?.id, t.branchId);
    assert.ok(t.owner.permissions.has("billing.manage"));
  });
  it("rejects duplicate emails across tenants (global identity)", async () => {
    const db = await createTestDb();
    await provisionOrganization(db, { businessName: "A", ownerName: "A", ownerEmail: "dup@example.com", ownerPassword: "long-enough-password" });
    await assert.rejects(provisionOrganization(db, { businessName: "B", ownerName: "B", ownerEmail: "DUP@example.com", ownerPassword: "long-enough-password" }), /already exists/);
  });
  it("gives distinct slugs to businesses with the same name", async () => {
    const db = await createTestDb();
    const a = await provisionOrganization(db, { businessName: "Same Name", ownerName: "A", ownerEmail: "a@x.com", ownerPassword: "long-enough-password" });
    const b = await provisionOrganization(db, { businessName: "Same Name", ownerName: "B", ownerEmail: "b@x.com", ownerPassword: "long-enough-password" });
    const rows = await db.col<{ id: string; slug: string }>("organizations").find({}, { sort: { slug: 1 } });
    assert.deepEqual(rows.map((r) => r.slug), ["same-name", "same-name-2"]);
    assert.notEqual(a.orgId, b.orgId);
  });
});

describe("password login", () => {
  it("signs in with correct credentials and builds a live context", async () => {
    const t = await createTenant();
    const r = await loginWithPassword(t.db, { email: "owner1@example.com".replace("1", String(await ownerIndex(t.db))), password: "correct horse battery" });
    const ctx = await loadContext(t.db, r.token);
    assert.equal(ctx.userId, t.ownerId);
    assert.equal(r.home, "/app");
  });
  it("gives one generic error for wrong password and unknown email", async () => {
    const t = await createTenant();
    const email = await ownerEmail(t.db);
    await assert.rejects(loginWithPassword(t.db, { email, password: "nope-nope-nope" }), /Incorrect email or password/);
    await assert.rejects(loginWithPassword(t.db, { email: "ghost@example.com", password: "nope-nope-nope" }), /Incorrect email or password/);
  });
  it("rate limits repeated failures per email", async () => {
    const t = await createTenant();
    const email = await ownerEmail(t.db);
    for (let i = 0; i < 8; i += 1) await assert.rejects(loginWithPassword(t.db, { email, password: "bad-bad-bad-bad" }), /Incorrect/);
    await assert.rejects(loginWithPassword(t.db, { email, password: "correct horse battery" }), /Too many attempts/);
  });
  it("revoked sessions stop working immediately", async () => {
    const t = await createTenant();
    const r = await loginWithPassword(t.db, { email: await ownerEmail(t.db), password: "correct horse battery" });
    await loadContext(t.db, r.token);
    await revokeAllSessions(t.db, t.ownerId);
    await assert.rejects(loadContext(t.db, r.token), /sign in/);
  });
  it("a role change takes effect on the very next request", async () => {
    const t = await createTenant();
    const cashier = (await t.db.col<{ id: string; permissions: string[] }>("roles").findOne({ orgId: t.orgId, key: "cashier" }))!;
    const uid = newId("user");
    await t.db.col("users").insert({ id: uid, orgId: t.orgId, roleId: cashier.id, name: "Cara", email: "cara@example.com", emailLower: "cara@example.com", passwordHash: await hashSecret("long-enough-password"), branchIds: [t.branchId], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const login = await loginWithPassword(t.db, { email: "cara@example.com", password: "long-enough-password" });
    const before = await loadContext(t.db, login.token);
    assert.throws(() => requirePermission(before, "payments.refund"));
    await t.db.col("roles").update({ id: cashier.id }, { $set: { permissions: [...cashier.permissions, "payments.refund"] } });
    const after = await loadContext(t.db, login.token);
    assert.doesNotThrow(() => requirePermission(after, "payments.refund"));
  });
  it("menu image uploads and staff invitations require their matching RBAC permissions", async () => {
    const t = await createTenant();
    const waiter = (await t.db.col<{ id: string }>("roles").findOne({ orgId: t.orgId, key: "waiter" }))!;
    const uid = newId("user");
    await t.db.col("users").insert({
      id: uid,
      orgId: t.orgId,
      roleId: waiter.id,
      name: "Willa Waiter",
      email: "willa@example.com",
      emailLower: "willa@example.com",
      passwordHash: await hashSecret("long-enough-password"),
      branchIds: [t.branchId],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const waiterCtx = await t.ctxFor(uid);

    assert.throws(() => requirePermission(waiterCtx, "menu.manage"), /permission/i);
    assert.throws(() => requirePermission(waiterCtx, "staff.manage"), /permission/i);
    assert.doesNotThrow(() => requirePermission(t.owner, "menu.manage"));
    assert.doesNotThrow(() => requirePermission(t.owner, "staff.manage"));
  });
  it("suspension blocks and deactivation signs out", async () => {
    const t = await createTenant();
    const r = await loginWithPassword(t.db, { email: await ownerEmail(t.db), password: "correct horse battery" });
    await t.db.col("organizations").update({ id: t.orgId }, { $set: { status: "suspended" } });
    assert.equal((await loadContext(t.db, r.token)).access.level, "blocked");
    await t.db.col("users").update({ id: t.ownerId }, { $set: { status: "disabled" } });
    await assert.rejects(loadContext(t.db, r.token), /sign in/);
  });
});

describe("tenant isolation", () => {
  it("services refuse references to another tenant's records", async () => {
    // MongoDB has no foreign keys: isolation is enforced by every query filtering on orgId.
    const db = await createTestDb();
    const a = await createTenant(db);
    const b = await createTenant(db);
    const bRole = (await db.col("roles").findOne({ orgId: b.orgId, key: "cashier" }))!;
    const { saveStaff } = await import("@/modules/admin/service");
    await assert.rejects(saveStaff(a.owner, { name: "X", email: "x@x.com", roleId: bRole.id, branchIds: [a.branchId], password: "Savanna-Orchid-2026!" } as never), /not found/i);
    const { getOrder } = await import("@/modules/orders/service");
    await assert.rejects(getOrder(a.owner, "ord_does_not_exist"), /not found/i);
  });
  it("a user only sees their assigned branches", async () => {
    const t = await createTenant();
    const second = newId("branch");
    await t.db.col("branches").insert({ id: second, orgId: t.orgId, code: "WLD", name: "Westlands", displayKey: "k2", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
    assert.equal(t.owner.branches.length, 1); // snapshot before branch
    const fresh = await t.ctxFor(t.ownerId);
    assert.equal(fresh.branches.length, 2); // owner = all branches
    const role = (await t.db.col("roles").findOne({ orgId: t.orgId, key: "manager" }))!;
    const uid = newId("user");
    await t.db.col("users").insert({ id: uid, orgId: t.orgId, roleId: role.id, name: "Mo", email: "mo@x.com", emailLower: "mo@x.com", branchIds: [second], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
    const mo = await t.ctxFor(uid, second);
    assert.deepEqual(mo.branches.map((b) => b.code), ["WLD"]);
    assert.throws(() => requireBranch(mo, t.branchId), /not found/i);
  });
});

describe("terminals & PIN login", () => {
  it("pairs a device, lists PIN staff, signs in with a PIN, locks out after 5 bad tries", async () => {
    const t = await createTenant();
    const { code } = await createTerminalPairing(t.db, { orgId: t.orgId, branchId: t.branchId, name: "Front POS", kind: "pos" });
    const claimed = await claimTerminalPairing(t.db, { code });
    await assert.rejects(claimTerminalPairing(t.db, { code }), /invalid or has expired/);

    const role = (await t.db.col("roles").findOne({ orgId: t.orgId, key: "cashier" }))!;
    const uid = newId("user");
    await t.db.col("users").insert({ id: uid, orgId: t.orgId, roleId: role.id, name: "Cara", branchIds: [t.branchId], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", pinHash: "scrypt$x" });
    await setUserPin(t.db, t.orgId, uid, "4821");

    const terminal = (await getTerminalByToken(t.db, claimed.token))!;
    const staff = await listPinUsers(t.db, terminal);
    assert.ok(staff.some((s) => s.id === uid));

    const ok = await loginWithPin(t.db, { terminalToken: claimed.token, userId: uid, pin: "4821" });
    const ctx = await loadContext(t.db, ok.token);
    assert.equal(ctx.sessionKind, "pin");
    assert.equal(ctx.activeBranch?.id, t.branchId);
    assert.equal(ok.home, "/pos");

    for (let i = 0; i < 5; i += 1) await assert.rejects(loginWithPin(t.db, { terminalToken: claimed.token, userId: uid, pin: "0000" }), /Incorrect PIN/);
    await assert.rejects(loginWithPin(t.db, { terminalToken: claimed.token, userId: uid, pin: "4821" }), /Too many attempts/);
  });
  it("an unpaired token cannot sign anyone in", async () => {
    const t = await createTenant();
    await assert.rejects(loginWithPin(t.db, { terminalToken: "bogus", userId: t.ownerId, pin: "1234" }), /isn't paired/);
  });
});

describe("counters & rate limiter", () => {
  it("counters are sequential per scope", async () => {
    const t = await createTenant();
    assert.equal(await nextCounter(t.db, t.orgId, t.branchId, "order:2026-01-01"), 1);
    assert.equal(await nextCounter(t.db, t.orgId, t.branchId, "order:2026-01-01"), 2);
    assert.equal(await nextCounter(t.db, t.orgId, t.branchId, "order:2026-01-02"), 1);
  });
  it("rate window resets after it elapses", async () => {
    const db = await createTestDb();
    const t0 = new Date("2026-01-01T00:00:00Z");
    const rule = { key: "k", limit: 2, windowSeconds: 60 };
    assert.equal((await consumeRateLimit(db, rule, t0)).allowed, true);
    assert.equal((await consumeRateLimit(db, rule, t0)).allowed, true);
    assert.equal((await consumeRateLimit(db, rule, t0)).allowed, false);
    assert.equal((await consumeRateLimit(db, rule, new Date(t0.getTime() + 61_000))).allowed, true);
  });
});

async function ownerEmail(db: import("@/platform/db").Db) {
  const rows = await db.col<{ id: string; email: string }>("users").find({}, { sort: { createdAt: -1 }, limit: 1 });
  return rows[0]!.email;
}
async function ownerIndex(db: import("@/platform/db").Db) {
  const e = await ownerEmail(db);
  return e.match(/owner(\d+)@/)![1];
}
