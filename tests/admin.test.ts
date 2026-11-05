import test from "node:test";
import assert from "node:assert/strict";
import { createTenant } from "./helpers";
import * as admin from "@/modules/admin/service";
import { loginWithPassword } from "@/modules/identity/auth.service";
import { staffSchema, settingsSchema } from "@/modules/admin/schema";

async function roleId(t: Awaited<ReturnType<typeof createTenant>>, key: string) {
  return (await t.db.col("roles").findOne({ orgId: t.orgId, key }))!.id;
}

test("staff: create, sign in, role change, disable, last owner protected", async () => {
  const t = await createTenant();
  const cashier = await roleId(t, "cashier");
  const parsed = staffSchema.parse({ name: "Brian", roleId: cashier, branchIds: t.branchId, email: "Brian@Example.com", password: "temporary pass 123" });
  const { id } = await admin.saveStaff(t.owner, parsed);
  const login = await loginWithPassword(t.db, { email: "brian@example.com", password: "temporary pass 123" });
  assert.ok(login.token); assert.equal(login.mustChangePassword, true);
  await assert.rejects(() => admin.saveStaff(t.owner, staffSchema.parse({ name: "X", roleId: cashier, branchIds: t.branchId, email: "brian@example.com", password: "temporary pass 123" })), /already used/);
  await admin.setStaffStatus(t.owner, id, "disabled");
  await assert.rejects(() => loginWithPassword(t.db, { email: "brian@example.com", password: "temporary pass 123" }));
  await assert.rejects(() => admin.setStaffStatus(t.owner, t.ownerId, "disabled"), /own account/);
  const manager = await roleId(t, "manager");
  await assert.rejects(() => admin.saveStaff(t.owner, staffSchema.parse({ id: t.ownerId, name: "Olivia", roleId: manager, branchIds: t.branchId, email: "owner@example.com" })), /at least one active owner/);
});

test("staff needs a branch unless the role spans all; PIN-only staff allowed", async () => {
  const t = await createTenant();
  const cashier = await roleId(t, "cashier");
  await assert.rejects(() => admin.saveStaff(t.owner, staffSchema.parse({ name: "NoBranch", roleId: cashier, branchIds: [], pin: "4821" })), /at least one branch/i);
  const r = await admin.saveStaff(t.owner, staffSchema.parse({ name: "Pin Only", roleId: cashier, branchIds: [t.branchId], pin: "4821" }));
  assert.ok(r.id);
  assert.equal((await admin.listStaff(t.owner)).find((s) => s.id === r.id)!.hasPin, true);
});

test("invitation flow creates a working account once", async () => {
  const t = await createTenant();
  const { token } = await admin.createInvitation(t.owner, { email: "new@example.com", roleId: await roleId(t, "waiter"), branchIds: [t.branchId] } as never);
  assert.equal((await admin.previewInvitation(t.db, token))?.email, "new@example.com");
  await admin.acceptInvitation(t.db, { token, name: "Newbie", password: "Hj7-quartz-lantern" });
  assert.ok((await loginWithPassword(t.db, { email: "new@example.com", password: "Hj7-quartz-lantern" })).token);
  await assert.rejects(() => admin.acceptInvitation(t.db, { token, name: "Again", password: "Hj7-quartz-lantern" }), /invalid or has expired/);
});

test("custom roles: no privilege escalation, system roles locked, in-use roles protected", async () => {
  const t = await createTenant();
  const waiter = await roleId(t, "waiter");
  const w = await admin.saveStaff(t.owner, staffSchema.parse({ name: "W", roleId: waiter, branchIds: [t.branchId], pin: "1234" }));
  const wctx = await t.ctxFor(w.id);
  await assert.rejects(() => admin.saveRole(wctx, { name: "Sneaky", allBranches: false, permissions: ["settings.manage"] } as never), /don't have/);
  const r = await admin.saveRole(t.owner, { name: "Host", allBranches: false, permissions: ["orders.view", "orders.create"] } as never);
  await assert.rejects(() => admin.saveRole(t.owner, { id: waiter, name: "x", allBranches: false, permissions: [] } as never), /Built-in/);
  await admin.saveStaff(t.owner, staffSchema.parse({ id: w.id, name: "W", roleId: r.id, branchIds: [t.branchId], pin: "1234" }));
  await assert.rejects(() => admin.deleteRole(t.owner, r.id), /Reassign/);
});

test("floor, branches limit, terminals, settings, audit", async () => {
  const t = await createTenant();
  const area = await admin.saveArea(t.owner, { branchId: t.branchId, name: "Patio" });
  await admin.saveTable(t.owner, { branchId: t.branchId, areaId: area.id, label: "P1", seats: 4 });
  await assert.rejects(() => admin.saveTable(t.owner, { branchId: t.branchId, label: "p1", seats: 2 }), /already exists/);
  const f = await admin.getFloor(t.owner, t.branchId);
  assert.equal(f.areas[0]!.tables.length, 1);
  await admin.removeTable(t.owner, f.areas[0]!.tables[0]!.id);
  assert.equal((await admin.getFloor(t.owner, t.branchId)).areas[0]!.tables.length, 0);
  await admin.saveTable(t.owner, { branchId: t.branchId, label: "P1", seats: 4 }); // label reusable after retire

  const pair = await admin.pairTerminal(t.owner, { branchId: t.branchId, name: "Front POS", kind: "pos" });
  assert.match(pair.code, /^\d{6}$/);
  await assert.rejects(() => admin.saveBranch(t.owner, { name: "B2", code: "b2" } as never).then(() => admin.saveBranch(t.owner, { name: "Dup", code: "B2" } as never)), /already used/);

  await admin.saveSettings(t.owner, settingsSchema.parse({ taxLabel: "VAT", taxRatePercent: "16", taxInclusive: "on", serviceChargePercent: "10", serviceChargeTypes: "dine_in", orderTypes: ["dine_in", "takeaway"], paymentMethods: ["cash", "mpesa"], requireShiftForCash: "on", kitchenLateMinutes: "12" }));
  const ctx = await t.ctxFor(t.ownerId);
  assert.equal(ctx.settings.taxRateBp, 1600); assert.equal(ctx.settings.serviceChargeBp, 1000); assert.deepEqual(ctx.settings.paymentMethods, ["cash", "mpesa"]);
  assert.ok((await admin.listAudit(ctx, { q: "settings" })).length >= 1);
});

test("onboarding configures the tenant, seeds data and can't run twice", async () => {
  const t = await createTenant();
  await t.db.col("organizations").update({ id: t.orgId }, { $set: { onboardingStatus: "in_progress" } });
  const ctx = await t.ctxFor(t.ownerId);
  assert.equal(ctx.org.onboardingComplete, false);
  const { onboardingSchema } = await import("@/modules/admin/schema");
  await admin.completeOnboarding(ctx, onboardingSchema.parse({ currency: "KES", timezone: "Africa/Nairobi", taxRatePercent: "16", taxInclusive: "on", tableCount: "3", sampleMenu: "on" }));
  const after = await t.ctxFor(t.ownerId);
  assert.equal(after.org.onboardingComplete, true); assert.equal(after.settings.taxRateBp, 1600);
  assert.equal((await admin.getFloor(after, t.branchId)).unassigned.length, 3);
  assert.equal(await t.db.col("products").count({ orgId: t.orgId }), 8);
  await assert.rejects(() => admin.completeOnboarding(after, onboardingSchema.parse({ currency: "KES", timezone: "Africa/Nairobi", taxRatePercent: "0", tableCount: "0" })), /already complete/);
});

test("customer display board shows only numbers, splits preparing/ready, rejects unknown keys", async () => {
  const t = await createTenant();
  const ctx = await t.ctxFor(t.ownerId);
  const { slideSchema } = await import("@/modules/admin/schema");
  await admin.saveSlide(ctx, slideSchema.parse({ title: "Happy hour", body: "2-for-1 drinks", imageUrl: "https://images.example.com/special.webp", durationS: "6" }));
  const key = (await t.db.col<{ id: string; displayKey: string }>("branches").findOne({ id: t.branchId }))!.displayKey;
  const { saveCategory, saveProduct } = await import("@/modules/menu/service");
  const orders = await import("@/modules/orders/service");
  const cat = await saveCategory(ctx, { name: "M", color: "#4338ca", sortOrder: 0, isActive: true } as never);
  const p = await saveProduct(ctx, { name: "Tea", categoryId: cat.id, basePriceMinor: 1000, isActive: true, isTaxExempt: false, prepMinutes: 1, sortOrder: 0, description: "", variants: [], modifierGroupIds: [] } as never);
  const o = await orders.openOrder(ctx, { branchId: t.branchId, type: "takeaway" });
  await orders.addItems(ctx, o.id, [{ productId: p.id, qty: 1 }]);
  await orders.sendToKitchen(ctx, o.id);
  let board = await admin.getDisplayBoard(t.db, key);
  assert.deepEqual(board!.waiting.map((x) => x.number), [o.number]); assert.deepEqual(board!.waiting[0]!.items, [{ name: "Tea", qty: 1 }]); assert.deepEqual(board!.ready, []); assert.equal(board!.slides.length, 1); assert.equal(board!.slides[0]!.imageUrl, "https://images.example.com/special.webp");
  assert.deepEqual(board!.menu.map((g) => [g.name, g.items.map((i) => i.name)]), [["M", ["Tea"]]]);
  await orders.bumpOrder(ctx, o.id, "ready");
  board = await admin.getDisplayBoard(t.db, key);
  assert.deepEqual(board!.ready.map((x) => x.number), [o.number]); assert.deepEqual(board!.waiting, []);
  assert.equal(await admin.getDisplayBoard(t.db, "nope"), null);
});
