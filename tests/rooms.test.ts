import test from "node:test";
import assert from "node:assert/strict";
import { createTenant } from "./helpers";
import { __setEnvForTests } from "@/platform/env";
import { saveCategory, saveProduct } from "@/modules/menu/service";
import * as rooms from "@/modules/rooms/service";
import { guestMenu, guestStatus, placeRoomOrder, resolveRoom } from "@/modules/guest/service";
import * as orders from "@/modules/orders/service";
import { SYSTEM_ROLES } from "@/platform/rbac/roles";

const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function setup() {
  __setEnvForTests({ APP_URL: "https://pos.example.com" });
  const t = await createTenant();
  const cat = await saveCategory(t.owner, { name: "Mains", color: "#4338ca", sortOrder: 0, isActive: true } as never);
  const burger = await saveProduct(t.owner, { name: "Burger", categoryId: cat.id, basePriceMinor: 100000, isActive: true, isTaxExempt: false, prepMinutes: 5, sortOrder: 0, description: "", variants: [], modifierGroupIds: [] } as never);
  await t.db.col("orgSettings").update({ id: t.orgId }, { $set: { taxRateBp: 0, serviceChargeBp: 0 } });
  const ctx = await t.ctxFor(t.ownerId);
  const type = await rooms.saveRoomType(ctx, { name: "Deluxe", baseRateMinor: 500000, capacity: 2, amenities: ["Wi-Fi", "TV"] } as never);
  const r101 = await rooms.saveRoom(ctx, { branchId: t.branchId, number: "101", roomTypeId: type.id, status: "ready" } as never);
  const r102 = await rooms.saveRoom(ctx, { branchId: t.branchId, number: "102", roomTypeId: type.id, status: "ready" } as never);
  const board = await rooms.getRoomsBoard(ctx, t.branchId);
  return { t, ctx, burger, type, r101, r102, today: board.today, token: board.rooms.find((r) => r.number === "101")!.qrToken };
}
const book = (s: Awaited<ReturnType<typeof setup>>, roomId: string, inD: string, outD: string, extra: Record<string, unknown> = {}) =>
  rooms.createBooking(s.ctx, { branchId: s.t.branchId, roomId, guestName: "Grace Guest", adults: 1, checkIn: inD, checkOut: outD, ...extra } as never);
const items = (productId: string, qty = 1) => [{ productId, qty }] as never;

test("bookings price by nights and can't overlap on the same room", async () => {
  const s = await setup();
  const b = await book(s, s.r101.id, s.today, add(s.today, 3));
  assert.match(b.number, /^BK-\d{4}-0001$/);
  const { booking } = await rooms.getBooking(s.ctx, b.id);
  assert.equal(booking.nights, 3); assert.equal(booking.roomTotalMinor, 1_500_000);
  await assert.rejects(() => book(s, s.r101.id, add(s.today, 2), add(s.today, 4)), /already booked/);
  await book(s, s.r101.id, add(s.today, 3), add(s.today, 5)); // back-to-back is fine
  await book(s, s.r102.id, s.today, add(s.today, 1)); // other room is fine
  await assert.rejects(() => book(s, s.r102.id, s.today, s.today), /after check-in/);
  await assert.rejects(() => book(s, s.r102.id, add(s.today, 5), add(s.today, 6), { adults: 5 }), /sleeps up to 2/);
});

test("availability excludes booked and out-of-service rooms", async () => {
  const s = await setup();
  await book(s, s.r101.id, s.today, add(s.today, 2));
  assert.deepEqual((await rooms.availableRooms(s.ctx, s.t.branchId, s.today, add(s.today, 1))).map((r) => r.number), ["102"]);
  await rooms.setRoomStatus(s.ctx, s.r102.id, "maintenance");
  assert.equal((await rooms.availableRooms(s.ctx, s.t.branchId, s.today, add(s.today, 1))).length, 0);
  await assert.rejects(() => book(s, s.r102.id, s.today, add(s.today, 1)), /out of service/);
});

test("check-in issues a stay code; future arrivals cannot check in early", async () => {
  const s = await setup();
  const later = await book(s, s.r102.id, add(s.today, 2), add(s.today, 3));
  await assert.rejects(() => rooms.checkIn(s.ctx, later.id), /opens on/);
  const b = await book(s, s.r101.id, s.today, add(s.today, 2));
  const { stayCode } = await rooms.checkIn(s.ctx, b.id);
  assert.match(stayCode, /^\d{6}$/);
  await assert.rejects(() => rooms.checkIn(s.ctx, b.id), /isn't waiting/);
  const board = await rooms.getRoomsBoard(s.ctx, s.t.branchId);
  assert.equal(board.stats.occupied, 1);
});

test("room QR: read-only until checked in; wrong code refused; order lands on the folio and kitchen", async () => {
  const s = await setup();
  let st = await resolveRoom(s.t.db, s.token); assert.ok(st.ok && !st.orderingOpen);
  const base = { token: s.token, guestKey: "guestROOM0001", ip: "198.51.100.4" };
  await assert.rejects(() => placeRoomOrder(s.t.db, { ...base, submitKey: "submit000001", stayCode: "123456", items: items(s.burger.id) }), /once you have checked in/);
  const b = await book(s, s.r101.id, s.today, add(s.today, 2));
  const { stayCode } = await rooms.checkIn(s.ctx, b.id);
  st = await resolveRoom(s.t.db, s.token); assert.ok(st.ok && st.orderingOpen);
  assert.equal((await guestMenu(s.t.db, st.ok ? st.target : (undefined as never))).products.length, 1);
  const wrong = stayCode === "000000" ? "000001" : "000000";
  await assert.rejects(() => placeRoomOrder(s.t.db, { ...base, submitKey: "submit000002", stayCode: wrong, items: items(s.burger.id) }), /code isn't right/);
  const ok = await placeRoomOrder(s.t.db, { ...base, submitKey: "submit000003", stayCode, items: items(s.burger.id, 2) });
  assert.equal(ok.totalMinor, 200000); assert.equal(ok.sentToKitchen, true);
  const again = await placeRoomOrder(s.t.db, { ...base, submitKey: "submit000003", stayCode, items: items(s.burger.id, 2) });
  assert.equal(again.lines.length, 1, "idempotent");
  const o = (await s.t.db.col<{ id: string; type: string; roomId: string; bookingId: string; tableId: string | null }>("orders").find({ orgId: s.t.orgId, status: "open" }))[0]!;
  assert.equal(o.type, "room_service"); assert.equal(o.bookingId, b.id); assert.equal(o.tableId, null);
  const view = await orders.getOrder(s.ctx, o.id);
  assert.equal(view.tableLabel, "Room 101");
  const f = (await rooms.getBooking(s.ctx, b.id)).folio;
  assert.equal(f.serviceChargesMinor, 200000); assert.equal(f.chargesMinor, 1_000_000 + 200000);
});

test("checkout posts room service to the folio, needs the balance cleared, and kills the stay code", async () => {
  const s = await setup();
  const b = await book(s, s.r101.id, s.today, add(s.today, 2));
  const { stayCode } = await rooms.checkIn(s.ctx, b.id);
  await placeRoomOrder(s.t.db, { token: s.token, guestKey: "guestROOM0001", ip: null, submitKey: "submit000001", stayCode, items: items(s.burger.id) });
  await assert.rejects(() => rooms.checkOut(s.ctx, b.id), /still owes/);
  await rooms.recordBookingPayment(s.ctx, b.id, { method: "cash", amountMinor: 1_000_000 });
  await assert.rejects(() => rooms.checkOut(s.ctx, b.id), /still owes/);
  await rooms.recordBookingPayment(s.ctx, b.id, { method: "card", amountMinor: 100000, reference: "RRN1" });
  const r = await rooms.checkOut(s.ctx, b.id);
  assert.equal(r.balanceMinor, 0);
  const after = await rooms.getBooking(s.ctx, b.id);
  assert.equal(after.booking.status, "checked_out"); assert.equal(after.booking.stayCode, null);
  assert.equal(after.folio.openOrderCount, 0);
  const pay = await s.t.db.col<{ id: string; method: string }>("payments").find({ orgId: s.t.orgId });
  assert.deepEqual(pay.map((p) => p.method), ["room"]);
  assert.equal((await s.t.db.col<{ id: string; status: string }>("rooms").findOne({ id: s.r101.id }))!.status, "cleaning");
  await assert.rejects(() => placeRoomOrder(s.t.db, { token: s.token, guestKey: "guestROOM0001", ip: null, submitKey: "submit000009", stayCode, items: items(s.burger.id) }), /once you have checked in/);
});

test("waiving a balance needs rooms.manage and a reason; early checkout frees the room", async () => {
  const s = await setup();
  const b = await book(s, s.r101.id, s.today, add(s.today, 5));
  await rooms.checkIn(s.ctx, b.id);
  const reception = SYSTEM_ROLES.find((r) => r.key === "receptionist")!;
  assert.ok(reception.permissions.includes("bookings.manage") && !reception.permissions.includes("rooms.manage"));
  await assert.rejects(() => rooms.checkOut({ ...s.ctx, permissions: new Set(reception.permissions) }, b.id, { waive: true, reason: "Goodwill" }), /permission/);
  await assert.rejects(() => rooms.checkOut(s.ctx, b.id, { waive: true }), /reason/);
  await rooms.checkOut(s.ctx, b.id, { waive: true, reason: "Goodwill" });
  assert.equal((await rooms.getBooking(s.ctx, b.id)).folio.balanceMinor, 0);
  await book(s, s.r101.id, add(s.today, 1), add(s.today, 3)); // today < checkOut, so the unused nights are free again
});

test("cancel only upcoming; a checked-in room can't be removed", async () => {
  const s = await setup();
  const up = await book(s, s.r102.id, add(s.today, 4), add(s.today, 5));
  await rooms.cancelBooking(s.ctx, up.id);
  await book(s, s.r102.id, add(s.today, 4), add(s.today, 5)); // freed
  const b = await book(s, s.r101.id, s.today, add(s.today, 1));
  await rooms.checkIn(s.ctx, b.id);
  await assert.rejects(() => rooms.cancelBooking(s.ctx, b.id), /upcoming/);
  await assert.rejects(() => rooms.removeRoom(s.ctx, s.r101.id), /current or upcoming/);
});

test("regenerating a room QR kills the old link", async () => {
  const s = await setup();
  await rooms.regenerateRoomQr(s.ctx, s.r101.id);
  assert.equal((await resolveRoom(s.t.db, s.token)).ok, false);
  assert.equal((await guestStatus(s.t.db, { kind: "room", token: "x", orgId: s.t.orgId, branchId: s.t.branchId, targetId: s.r101.id, label: "101", bookingId: null }, "guestROOM0001")).lines.length, 0);
});
