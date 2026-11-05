import test from "node:test";
import assert from "node:assert/strict";
import { createTenant } from "./helpers";
import { __setEnvForTests } from "@/platform/env";
import { saveCategory, saveProduct } from "@/modules/menu/service";
import { saveTable } from "@/modules/admin/service";
import * as orders from "@/modules/orders/service";
import { getQrBoard } from "@/modules/guest/qr-board";
import { guestMenu, guestStatus, placeTableOrder, regenerateTableToken, resolveTable } from "@/modules/guest/service";

async function setup() {
  __setEnvForTests({ APP_URL: "https://pos.example.com" });
  const t = await createTenant();
  const cat = await saveCategory(t.owner, { name: "Mains", color: "#4338ca", sortOrder: 0, isActive: true } as never);
  const mk = (name: string, price: number) => saveProduct(t.owner, { name, categoryId: cat.id, basePriceMinor: price, isActive: true, isTaxExempt: false, prepMinutes: 5, sortOrder: 0, description: "", variants: [], modifierGroupIds: [] } as never);
  const burger = await mk("Burger", 100000);
  const tea = await mk("Tea", 20000);
  await saveTable(t.owner, { branchId: t.branchId, label: "T1", seats: 4 } as never);
  await saveTable(t.owner, { branchId: t.branchId, label: "T2", seats: 2 } as never);
  const board = await getQrBoard(t.owner, t.branchId);
  return { t, burger, tea, board, t1: board.tables.find((x) => x.label === "T1")! };
}
const place = (db: Awaited<ReturnType<typeof setup>>["t"]["db"], token: string, guestKey: string, submitKey: string, items: { productId: string; qty: number }[]) =>
  placeTableOrder(db, { token, guestKey, submitKey, items: items as never, ip: "203.0.113.9" });

test("every table gets a distinct unguessable token and a scan URL", async () => {
  const { board } = await setup();
  assert.equal(board.tables.length, 2);
  const tokens = new Set(board.tables.map((t) => t.token));
  assert.equal(tokens.size, 2);
  for (const t of board.tables) { assert.ok(t.token.length >= 20); assert.equal(t.url, `https://pos.example.com/o/${t.token}`); }
});

test("unknown tokens resolve to nothing; menu hides internals", async () => {
  const { t, t1 } = await setup();
  assert.deepEqual(await resolveTable(t.db, "x".repeat(24)), { ok: false, reason: "not_found" });
  assert.deepEqual(await resolveTable(t.db, "short"), { ok: false, reason: "not_found" });
  const s = await resolveTable(t.db, t1.token);
  assert.ok(s.ok);
  const menu = await guestMenu(t.db, s.ok ? s.target : (undefined as never));
  assert.equal(menu.products.length, 2);
  assert.ok(!("sku" in menu.products[0]!) && !("stationId" in menu.products[0]!));
});

test("a scan-and-order lands on that table's order and goes to the kitchen", async () => {
  const { t, burger, t1 } = await setup();
  const st = await place(t.db, t1.token, "guestAAAA1111", "submit000001", [{ productId: burger.id, qty: 2 }]);
  assert.equal(st.lines.length, 1); assert.equal(st.sentToKitchen, true); assert.equal(st.totalMinor, 200000);
  const open = await t.db.col<{ id: string; tableId: string; source: string; type: string }>("orders").find({ orgId: t.orgId, status: "open" });
  assert.equal(open.length, 1); assert.equal(open[0]!.tableId, t1.id); assert.equal(open[0]!.type, "dine_in"); assert.equal(open[0]!.source, "qr_table");
  const view = await orders.getOrder(await t.ctxFor(t.ownerId), open[0]!.id);
  assert.equal(view.tableLabel, "T1"); assert.equal(view.items[0]!.status, "sent");
});

test("two guests share the table bill but only see their own items; resubmits are idempotent", async () => {
  const { t, burger, tea, t1 } = await setup();
  await place(t.db, t1.token, "guestAAAA1111", "submit000001", [{ productId: burger.id, qty: 1 }]);
  const again = await place(t.db, t1.token, "guestAAAA1111", "submit000001", [{ productId: burger.id, qty: 1 }]);
  assert.equal(again.lines.length, 1, "same submitKey must not duplicate");
  const b = await place(t.db, t1.token, "guestBBBB2222", "submit000002", [{ productId: tea.id, qty: 3 }]);
  assert.deepEqual(b.lines.map((l) => l.name), ["Tea"]);
  const s = await resolveTable(t.db, t1.token); assert.ok(s.ok);
  assert.deepEqual((await guestStatus(t.db, s.ok ? s.target : (undefined as never), "guestAAAA1111")).lines.map((l) => l.name), ["Burger"]);
  assert.equal(await t.db.col("orders").count({ orgId: t.orgId, status: "open" }), 1, "one bill per table");
  const o = (await t.db.col<{ id: string; totalMinor: number }>("orders").find({ orgId: t.orgId, status: "open" }))[0]!;
  assert.equal(o.totalMinor, 160000);
});

test("staff-confirm mode keeps items held; limits and disabled switch are enforced", async () => {
  const { t, burger, t1 } = await setup();
  await t.db.col("orgSettings").update({ id: t.orgId }, { $set: { qrAutoSend: false } });
  const held = await place(t.db, t1.token, "guestAAAA1111", "submit000001", [{ productId: burger.id, qty: 1 }]);
  assert.equal(held.sentToKitchen, false);
  await assert.rejects(() => place(t.db, t1.token, "guestAAAA1111", "submit000002", [{ productId: burger.id, qty: 11 }]), /Up to 10/);
  await assert.rejects(() => place(t.db, t1.token, "guestAAAA1111", "submit000003", [{ productId: "nope", qty: 1 }]), /not found|Product/i);
  await t.db.col("orgSettings").update({ id: t.orgId }, { $set: { qrOrderingEnabled: false } });
  await assert.rejects(() => place(t.db, t1.token, "guestAAAA1111", "submit000004", [{ productId: burger.id, qty: 1 }]), /isn't taking QR orders/);
});

test("per-guest rate limit stops flooding", async () => {
  const { t, burger, t1 } = await setup();
  let blocked = false;
  for (let n = 0; n < 15; n += 1) {
    try { await place(t.db, t1.token, "guestFLOOD001", `flood${String(n).padStart(8, "0")}`, [{ productId: burger.id, qty: 1 }]); } catch (e) { if ((e as Error).name === "RateLimitError" || /too many/i.test((e as Error).message)) blocked = true; }
  }
  assert.ok(blocked);
});

test("regenerating a table's code kills the old one", async () => {
  const { t, t1 } = await setup();
  const fresh = await regenerateTableToken(t.owner, t1.id);
  assert.notEqual(fresh, t1.token);
  assert.equal((await resolveTable(t.db, t1.token)).ok, false);
  assert.equal((await resolveTable(t.db, fresh)).ok, true);
});

test("suspended tenants cannot be ordered from", async () => {
  const { t, t1 } = await setup();
  await t.db.col("organizations").update({ id: t.orgId }, { $set: { status: "suspended" } });
  assert.deepEqual(await resolveTable(t.db, t1.token), { ok: false, reason: "unavailable" });
});
