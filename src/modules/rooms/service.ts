import type { Ctx } from "@/platform/auth/context";
import type { Doc } from "@/platform/db";
import { nextCounter } from "@/platform/db";
import { audit } from "@/platform/audit/audit";
import { newId, newSecret } from "@/platform/ids";
import { randomInt } from "node:crypto";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/platform/errors";
import { requireAnyPermission, requireBranch, requirePermission } from "@/platform/rbac/guard";
import { businessDate, nowIso } from "@/platform/dates";
import { env } from "@/platform/env";
import { applyPayment } from "@/modules/orders/service";
import type { z } from "zod";
import type { bookingSchema, roomSchema, roomTypeSchema } from "./schema";

type In<T extends z.ZodTypeAny> = z.infer<T>;

export type RoomStatus = "ready" | "cleaning" | "maintenance";
export type BookingStatus = "reserved" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export const ACTIVE_STATUSES: BookingStatus[] = ["reserved", "checked_in"];

export interface RoomTypeDoc extends Doc { name: string; description: string | null; baseRateMinor: number; capacity: number; amenities: string[]; isActive: boolean }
export interface RoomDoc extends Doc { branchId: string; number: string; floor: string | null; roomTypeId: string; status: RoomStatus; qrToken: string; isActive: boolean; lockSeq?: number }
export interface BookingPayment { id: string; method: string; amountMinor: number; reference: string | null; at: string; by: string }
export interface BookingDoc extends Doc {
  branchId: string; number: string; roomId: string; roomNumber: string; roomTypeName: string; guestName: string; guestPhone: string | null; guestEmail: string | null; adults: number;
  checkIn: string; checkOut: string; nights: number; rateMinor: number; roomTotalMinor: number; status: BookingStatus; stayCode: string | null; payments: BookingPayment[];
  waivedMinor: number; waiveReason: string | null; notes: string | null; createdAt: string; checkedInAt: string | null; checkedOutAt: string | null; cancelledAt: string | null;
}

export const roomUrl = (token: string): string => `${env().APP_URL.replace(/\/$/, "")}/r/${token}`;
export const newStayCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const nightsBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const today = (ctx: Ctx, branchId: string): string => businessDate(new Date(), requireBranch(ctx, branchId).timezone || ctx.org.timezone);
const addDays = (d: string, n: number): string => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ types & rooms */

export async function listRoomTypes(ctx: Ctx): Promise<RoomTypeDoc[]> {
  requireAnyPermission(ctx, "rooms.view", "rooms.manage");
  return (await ctx.db.col<RoomTypeDoc>("roomTypes").find({ orgId: ctx.org.id, isActive: true })).sort((a, b) => a.name.localeCompare(b.name));
}
export async function saveRoomType(ctx: Ctx, i: In<typeof roomTypeSchema>): Promise<{ id: string }> {
  requirePermission(ctx, "rooms.manage");
  const all = await ctx.db.col<RoomTypeDoc>("roomTypes").find({ orgId: ctx.org.id, isActive: true });
  if (all.some((t) => t.id !== i.id && t.name.toLowerCase() === i.name.toLowerCase())) throw new ConflictError(`A room type called "${i.name}" already exists.`);
  const data = { name: i.name, description: i.description ?? null, baseRateMinor: i.baseRateMinor, capacity: i.capacity, amenities: i.amenities };
  if (i.id) { if (!(await ctx.db.col("roomTypes").update({ orgId: ctx.org.id, id: i.id }, { $set: data }))) throw new NotFoundError("Room type"); return { id: i.id }; }
  const id = newId("roomType");
  await ctx.db.col("roomTypes").insert({ id, orgId: ctx.org.id, ...data, isActive: true });
  await audit(ctx, { action: "roomtype.created", entityType: "roomType", entityId: id, summary: `Created room type ${i.name}` });
  return { id };
}
export async function removeRoomType(ctx: Ctx, id: string): Promise<void> {
  requirePermission(ctx, "rooms.manage");
  if (await ctx.db.col("rooms").findOne({ orgId: ctx.org.id, roomTypeId: id, isActive: true })) throw new BusinessRuleError("Move or remove the rooms of this type first.");
  await ctx.db.col("roomTypes").update({ orgId: ctx.org.id, id }, { $set: { isActive: false } });
}

export async function saveRoom(ctx: Ctx, i: In<typeof roomSchema>): Promise<{ id: string }> {
  requirePermission(ctx, "rooms.manage");
  requireBranch(ctx, i.branchId);
  if (!(await ctx.db.col("roomTypes").findOne({ orgId: ctx.org.id, id: i.roomTypeId, isActive: true }))) throw new NotFoundError("Room type");
  const here = await ctx.db.col<RoomDoc>("rooms").find({ orgId: ctx.org.id, branchId: i.branchId, isActive: true });
  if (here.some((r) => r.id !== i.id && r.number.toLowerCase() === i.number.toLowerCase())) throw new ConflictError(`Room ${i.number} already exists in this branch.`);
  if (i.id) {
    await ctx.db.col("rooms").update({ orgId: ctx.org.id, id: i.id }, { $set: { number: i.number, floor: i.floor ?? null, roomTypeId: i.roomTypeId, status: i.status } });
    return { id: i.id };
  }
  const id = newId("room");
  await ctx.db.col("rooms").insert({ id, orgId: ctx.org.id, branchId: i.branchId, number: i.number, floor: i.floor ?? null, roomTypeId: i.roomTypeId, status: i.status, qrToken: newSecret(16), isActive: true, lockSeq: 0 });
  await audit(ctx, { action: "room.created", entityType: "room", entityId: id, branchId: i.branchId, summary: `Created room ${i.number}` });
  return { id };
}
export async function removeRoom(ctx: Ctx, id: string): Promise<void> {
  requirePermission(ctx, "rooms.manage");
  const r = await ctx.db.col<RoomDoc>("rooms").findOne({ orgId: ctx.org.id, id });
  if (!r) throw new NotFoundError("Room");
  if (await ctx.db.col("bookings").findOne({ orgId: ctx.org.id, roomId: id, status: { $in: ACTIVE_STATUSES } })) throw new BusinessRuleError("This room has current or upcoming bookings.");
  await ctx.db.col("rooms").update({ orgId: ctx.org.id, id }, { $set: { isActive: false, number: `${r.number}~${newSecret(3)}`, qrToken: `x${newSecret(15)}` } });
}
export async function setRoomStatus(ctx: Ctx, id: string, status: RoomStatus): Promise<void> {
  requireAnyPermission(ctx, "rooms.manage", "bookings.manage");
  if (!(await ctx.db.col("rooms").update({ orgId: ctx.org.id, id }, { $set: { status } }))) throw new NotFoundError("Room");
}
export async function regenerateRoomQr(ctx: Ctx, id: string): Promise<void> {
  requirePermission(ctx, "rooms.manage");
  if (!(await ctx.db.col("rooms").update({ orgId: ctx.org.id, id }, { $set: { qrToken: newSecret(16) } }))) throw new NotFoundError("Room");
  await audit(ctx, { action: "room.qr_regenerated", entityType: "room", entityId: id, summary: "Regenerated room QR code" });
}

/* ------------------------------------------------------------------ availability */

/** Rooms of the branch that have no live booking overlapping [checkIn, checkOut). */
export async function availableRooms(ctx: Ctx, branchId: string, checkIn: string, checkOut: string, ignoreBookingId?: string): Promise<(RoomDoc & { typeName: string; rateMinor: number; capacity: number })[]> {
  requireAnyPermission(ctx, "rooms.view", "bookings.manage");
  requireBranch(ctx, branchId);
  const [rooms, types, bookings] = await Promise.all([
    ctx.db.col<RoomDoc>("rooms").find({ orgId: ctx.org.id, branchId, isActive: true }),
    ctx.db.col<RoomTypeDoc>("roomTypes").find({ orgId: ctx.org.id }),
    ctx.db.col<BookingDoc>("bookings").find({ orgId: ctx.org.id, branchId, status: { $in: ACTIVE_STATUSES }, checkIn: { $lt: checkOut }, checkOut: { $gt: checkIn } }),
  ]);
  const taken = new Set(bookings.filter((b) => b.id !== ignoreBookingId).map((b) => b.roomId));
  const ty = new Map(types.map((t) => [t.id, t]));
  return rooms.filter((r) => !taken.has(r.id) && r.status !== "maintenance").map((r) => ({ ...r, typeName: ty.get(r.roomTypeId)?.name ?? "", rateMinor: Number(ty.get(r.roomTypeId)?.baseRateMinor ?? 0), capacity: Number(ty.get(r.roomTypeId)?.capacity ?? 1) }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

/* ------------------------------------------------------------------ bookings */

export async function createBooking(ctx: Ctx, i: In<typeof bookingSchema>): Promise<{ id: string; number: string }> {
  requirePermission(ctx, "bookings.manage");
  requireBranch(ctx, i.branchId);
  const nights = nightsBetween(i.checkIn, i.checkOut);
  if (nights < 1) throw new BusinessRuleError("Check-out must be after check-in.");
  if (nights > 90) throw new BusinessRuleError("Stays longer than 90 nights need to be split into several bookings.");
  if (i.checkOut < today(ctx, i.branchId)) throw new BusinessRuleError("That stay is entirely in the past.");
  const room = await ctx.db.col<RoomDoc>("rooms").findOne({ orgId: ctx.org.id, branchId: i.branchId, id: i.roomId, isActive: true });
  if (!room) throw new NotFoundError("Room");
  if (room.status === "maintenance") throw new BusinessRuleError(`Room ${room.number} is out of service.`);
  const type = await ctx.db.col<RoomTypeDoc>("roomTypes").findOne({ orgId: ctx.org.id, id: room.roomTypeId });
  if (!type) throw new NotFoundError("Room type");
  if (i.adults > Number(type.capacity)) throw new BusinessRuleError(`${type.name} sleeps up to ${type.capacity}.`);

  // Serialise concurrent bookings of the same room: both transactions write this document, so one of them conflicts instead of double-booking.
  await ctx.db.col("rooms").update({ orgId: ctx.org.id, id: room.id }, { $inc: { lockSeq: 1 } });
  const clash = await ctx.db.col<BookingDoc>("bookings").findOne({ orgId: ctx.org.id, roomId: room.id, status: { $in: ACTIVE_STATUSES }, checkIn: { $lt: i.checkOut }, checkOut: { $gt: i.checkIn } });
  if (clash) throw new ConflictError(`Room ${room.number} is already booked ${clash.checkIn} → ${clash.checkOut} (${clash.number}).`);

  const year = i.checkIn.slice(0, 4);
  const seq = await nextCounter(ctx.db, ctx.org.id, null, `booking:${year}`);
  const id = newId("booking");
  const number = `BK-${year}-${String(seq).padStart(4, "0")}`;
  const rate = i.rateMinor ?? Number(type.baseRateMinor);
  await ctx.db.col("bookings").insert({
    id, orgId: ctx.org.id, branchId: i.branchId, number, roomId: room.id, roomNumber: room.number, roomTypeName: type.name, guestName: i.guestName, guestPhone: i.guestPhone ?? null, guestEmail: i.guestEmail ?? null,
    adults: i.adults, checkIn: i.checkIn, checkOut: i.checkOut, nights, rateMinor: rate, roomTotalMinor: rate * nights, status: "reserved", stayCode: null, payments: [], waivedMinor: 0, waiveReason: null,
    notes: i.notes ?? null, createdAt: nowIso(), checkedInAt: null, checkedOutAt: null, cancelledAt: null, createdBy: ctx.userId,
  });
  await audit(ctx, { action: "booking.created", entityType: "booking", entityId: id, branchId: i.branchId, summary: `${number}: ${i.guestName}, room ${room.number}, ${i.checkIn} → ${i.checkOut}` });
  return { id, number };
}

async function loadBooking(ctx: Ctx, id: string): Promise<BookingDoc> {
  const b = await ctx.db.col<BookingDoc>("bookings").findOne({ orgId: ctx.org.id, id });
  if (!b) throw new NotFoundError("Booking");
  requireBranch(ctx, b.branchId);
  return b;
}

export async function cancelBooking(ctx: Ctx, id: string, noShow = false): Promise<void> {
  requirePermission(ctx, "bookings.manage");
  const b = await loadBooking(ctx, id);
  if (b.status !== "reserved") throw new BusinessRuleError("Only upcoming bookings can be cancelled. Check the guest out instead.");
  await ctx.db.col("bookings").update({ orgId: ctx.org.id, id }, { $set: { status: noShow ? "no_show" : "cancelled", cancelledAt: nowIso() } });
  await audit(ctx, { action: noShow ? "booking.no_show" : "booking.cancelled", entityType: "booking", entityId: id, branchId: b.branchId, summary: `${b.number} ${noShow ? "marked no-show" : "cancelled"}` });
}

export async function checkIn(ctx: Ctx, id: string): Promise<{ stayCode: string }> {
  requirePermission(ctx, "bookings.manage");
  const b = await loadBooking(ctx, id);
  if (b.status !== "reserved") throw new BusinessRuleError("This booking isn't waiting for check-in.");
  const t = today(ctx, b.branchId);
  if (t < b.checkIn) throw new BusinessRuleError(`Check-in opens on ${b.checkIn}. Change the dates first if the guest arrived early.`);
  if (t >= b.checkOut) throw new BusinessRuleError("The stay has already ended. Mark it no-show or create a new booking.");
  const room = await ctx.db.col<RoomDoc>("rooms").findOne({ orgId: ctx.org.id, id: b.roomId });
  if (!room || !room.isActive) throw new NotFoundError("Room");
  if (room.status === "maintenance") throw new BusinessRuleError(`Room ${room.number} is out of service.`);
  const there = await ctx.db.col<BookingDoc>("bookings").findOne({ orgId: ctx.org.id, roomId: b.roomId, status: "checked_in" });
  if (there) throw new ConflictError(`Room ${room.number} still has ${there.guestName} checked in (${there.number}).`);
  const stayCode = newStayCode();
  await ctx.db.col("bookings").update({ orgId: ctx.org.id, id }, { $set: { status: "checked_in", stayCode, checkedInAt: nowIso() } });
  await ctx.db.col("rooms").update({ orgId: ctx.org.id, id: b.roomId }, { $set: { status: "ready" } });
  await audit(ctx, { action: "booking.checked_in", entityType: "booking", entityId: id, branchId: b.branchId, summary: `${b.guestName} checked in to room ${b.roomNumber}` });
  return { stayCode };
}

/* ------------------------------------------------------------------ folio */

export interface FolioOrder { id: string; number: string; status: string; totalMinor: number; openedAt: string; items: string }
export interface Folio {
  roomChargesMinor: number; serviceChargesMinor: number; chargesMinor: number; paidMinor: number; waivedMinor: number; balanceMinor: number;
  orders: FolioOrder[]; payments: BookingPayment[]; openOrderCount: number;
}
export async function getFolio(ctx: Ctx, b: BookingDoc): Promise<Folio> {
  const orders = (await ctx.db.col<Doc & { number: string; status: string; totalMinor: number; openedAt: string }>("orders").find({ orgId: ctx.org.id, bookingId: b.id, status: { $in: ["open", "closed"] } })).sort((x, y) => (x.openedAt < y.openedAt ? -1 : 1));
  const items = orders.length ? await ctx.db.col<Doc & { orderId: string; name: string; qty: number; status: string }>("orderItems").find({ orgId: ctx.org.id, orderId: { $in: orders.map((o) => o.id) } }) : [];
  const service = orders.reduce((s, o) => s + Number(o.totalMinor), 0);
  const paid = b.payments.reduce((s, p) => s + Number(p.amountMinor), 0);
  const charges = Number(b.roomTotalMinor) + service;
  return {
    roomChargesMinor: Number(b.roomTotalMinor), serviceChargesMinor: service, chargesMinor: charges, paidMinor: paid, waivedMinor: Number(b.waivedMinor), balanceMinor: charges - paid - Number(b.waivedMinor),
    orders: orders.map((o) => ({ id: o.id, number: o.number, status: o.status, totalMinor: Number(o.totalMinor), openedAt: o.openedAt, items: items.filter((x) => x.orderId === o.id && x.status !== "void").map((x) => `${x.qty}× ${x.name}`).join(", ") })),
    payments: b.payments, openOrderCount: orders.filter((o) => o.status === "open").length,
  };
}

export async function getBooking(ctx: Ctx, id: string): Promise<{ booking: BookingDoc; folio: Folio }> {
  requireAnyPermission(ctx, "rooms.view", "bookings.manage");
  const booking = await loadBooking(ctx, id);
  return { booking, folio: await getFolio(ctx, booking) };
}

export async function recordBookingPayment(ctx: Ctx, id: string, i: { method: string; amountMinor: number; reference?: string | null }): Promise<void> {
  requirePermission(ctx, "bookings.manage");
  const b = await loadBooking(ctx, id);
  if (b.status === "cancelled" || b.status === "no_show") throw new BusinessRuleError("This booking was cancelled.");
  const p: BookingPayment = { id: newId("payment"), method: i.method, amountMinor: i.amountMinor, reference: i.reference ?? null, at: nowIso(), by: ctx.userName };
  await ctx.db.col("bookings").update({ orgId: ctx.org.id, id }, { $set: { payments: [...b.payments, p] } });
  await audit(ctx, { action: "booking.payment", entityType: "booking", entityId: id, branchId: b.branchId, summary: `${b.number}: ${i.method} ${i.amountMinor}` });
}

/** Moves an open room-service order onto the guest's folio (the order is closed as "charged to room"). */
export async function postOrderToRoom(ctx: Ctx, orderId: string): Promise<void> {
  requirePermission(ctx, "bookings.manage");
  const o = await ctx.db.col<Doc & { bookingId?: string; totalMinor: number; paidMinor: number; status: string }>("orders").findOne({ orgId: ctx.org.id, id: orderId });
  if (!o || !o.bookingId) throw new BusinessRuleError("That is not a room-service order.");
  if (o.status !== "open") throw new BusinessRuleError("That order is already closed.");
  const due = Number(o.totalMinor) - Number(o.paidMinor);
  if (due <= 0) return;
  const sctx: Ctx = { ...ctx, settings: { ...ctx.settings, paymentMethods: [...new Set([...ctx.settings.paymentMethods, "room" as const])] } };
  await applyPayment(sctx, orderId, { orderId, method: "room", amountMinor: due, reference: o.bookingId } as never);
}

export async function checkOut(ctx: Ctx, id: string, opts: { waive?: boolean; reason?: string | null } = {}): Promise<{ balanceMinor: number }> {
  requirePermission(ctx, "bookings.manage");
  const b = await loadBooking(ctx, id);
  if (b.status !== "checked_in") throw new BusinessRuleError("Only checked-in guests can be checked out.");
  const open = await ctx.db.col<Doc>("orders").find({ orgId: ctx.org.id, bookingId: id, status: "open" });
  for (const o of open) {
    const items = await ctx.db.col("orderItems").count({ orgId: ctx.org.id, orderId: o.id, status: { $ne: "void" } });
    if (!items) { await ctx.db.col("orders").update({ orgId: ctx.org.id, id: o.id }, { $set: { status: "void", voidedAt: nowIso(), voidReason: "Guest checked out" } }); continue; }
    await postOrderToRoom(ctx, o.id);
  }
  const folio = await getFolio(ctx, (await loadBooking(ctx, id)));
  let waived = 0;
  if (folio.balanceMinor > 0) {
    if (!opts.waive) throw new BusinessRuleError(`The guest still owes ${folio.balanceMinor / 100}. Take payment first, or waive the balance with a reason.`);
    requirePermission(ctx, "rooms.manage");
    if (!opts.reason?.trim()) throw new BusinessRuleError("Give a reason for waiving the balance.");
    waived = folio.balanceMinor;
  }
  const t = today(ctx, b.branchId);
  const set: Record<string, unknown> = { status: "checked_out", stayCode: null, checkedOutAt: nowIso(), waivedMinor: Number(b.waivedMinor) + waived, waiveReason: waived ? opts.reason!.trim() : b.waiveReason };
  if (t < b.checkOut && t > b.checkIn) set.checkOut = t; // frees the room for the unused nights
  await ctx.db.col("bookings").update({ orgId: ctx.org.id, id }, { $set: set });
  await ctx.db.col("rooms").update({ orgId: ctx.org.id, id: b.roomId }, { $set: { status: "cleaning" } });
  await audit(ctx, { action: "booking.checked_out", entityType: "booking", entityId: id, branchId: b.branchId, summary: `${b.guestName} checked out of room ${b.roomNumber}${waived ? ` (waived ${waived})` : ""}` });
  return { balanceMinor: folio.balanceMinor - waived };
}

export async function regenerateStayCode(ctx: Ctx, id: string): Promise<string> {
  requirePermission(ctx, "bookings.manage");
  const b = await loadBooking(ctx, id);
  if (b.status !== "checked_in") throw new BusinessRuleError("Only checked-in guests have a room-service code.");
  const code = newStayCode();
  await ctx.db.col("bookings").update({ orgId: ctx.org.id, id }, { $set: { stayCode: code } });
  return code;
}

/* ------------------------------------------------------------------ overview */

export interface RoomCell { id: string; number: string; floor: string | null; typeName: string; status: RoomStatus; qrToken: string; occupancy: "occupied" | "arriving" | "departing" | "vacant"; current: { id: string; number: string; guestName: string; checkOut: string } | null; next: { id: string; number: string; guestName: string; checkIn: string } | null }
export interface RoomsBoard { branchId: string; branchName: string; today: string; rooms: RoomCell[]; types: RoomTypeDoc[]; stats: { total: number; occupied: number; arriving: number; departing: number; cleaning: number; maintenance: number }; bookings: BookingDoc[]; days: string[] }

export async function getRoomsBoard(ctx: Ctx, branchId: string, span = 14): Promise<RoomsBoard> {
  requireAnyPermission(ctx, "rooms.view", "rooms.manage", "bookings.manage");
  const branch = requireBranch(ctx, branchId);
  const t = today(ctx, branchId);
  const days = Array.from({ length: span }, (_, n) => addDays(t, n));
  const [rooms, types, bookings] = await Promise.all([
    ctx.db.col<RoomDoc>("rooms").find({ orgId: ctx.org.id, branchId, isActive: true }),
    ctx.db.col<RoomTypeDoc>("roomTypes").find({ orgId: ctx.org.id, isActive: true }),
    ctx.db.col<BookingDoc>("bookings").find({ orgId: ctx.org.id, branchId, status: { $in: ACTIVE_STATUSES }, checkOut: { $gte: t }, checkIn: { $lt: addDays(t, span) } }),
  ]);
  const ty = new Map(types.map((x) => [x.id, x]));
  const cells: RoomCell[] = rooms.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })).map((r) => {
    const mine = bookings.filter((b) => b.roomId === r.id).sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
    const cur = mine.find((b) => b.status === "checked_in") ?? null;
    const next = mine.find((b) => b.status === "reserved") ?? null;
    const occupancy: RoomCell["occupancy"] = cur ? (cur.checkOut === t ? "departing" : "occupied") : next && next.checkIn === t ? "arriving" : "vacant";
    return { id: r.id, number: r.number, floor: r.floor, typeName: ty.get(r.roomTypeId)?.name ?? "—", status: r.status, qrToken: r.qrToken, occupancy,
      current: cur ? { id: cur.id, number: cur.number, guestName: cur.guestName, checkOut: cur.checkOut } : null, next: next ? { id: next.id, number: next.number, guestName: next.guestName, checkIn: next.checkIn } : null };
  });
  return { branchId, branchName: branch.name, today: t, rooms: cells, types, bookings, days,
    stats: { total: cells.length, occupied: cells.filter((c) => c.current).length, arriving: cells.filter((c) => c.occupancy === "arriving").length, departing: cells.filter((c) => c.occupancy === "departing").length,
      cleaning: cells.filter((c) => c.status === "cleaning").length, maintenance: cells.filter((c) => c.status === "maintenance").length } };
}

export interface BookingRow { id: string; number: string; guestName: string; roomNumber: string; roomTypeName: string; checkIn: string; checkOut: string; nights: number; status: BookingStatus; roomTotalMinor: number; paidMinor: number }
export async function listBookings(ctx: Ctx, branchId: string, filter: "upcoming" | "in_house" | "past" | "all" = "upcoming"): Promise<BookingRow[]> {
  requireAnyPermission(ctx, "rooms.view", "bookings.manage");
  requireBranch(ctx, branchId);
  const rows = await ctx.db.col<BookingDoc>("bookings").find({ orgId: ctx.org.id, branchId });
  const keep = (b: BookingDoc) => filter === "all" || (filter === "upcoming" && b.status === "reserved") || (filter === "in_house" && b.status === "checked_in") || (filter === "past" && ["checked_out", "cancelled", "no_show"].includes(b.status));
  return rows.filter(keep).sort((a, b) => (filter === "past" ? (a.checkOut < b.checkOut ? 1 : -1) : a.checkIn < b.checkIn ? -1 : 1)).slice(0, 300)
    .map((b) => ({ id: b.id, number: b.number, guestName: b.guestName, roomNumber: b.roomNumber, roomTypeName: b.roomTypeName, checkIn: b.checkIn, checkOut: b.checkOut, nights: Number(b.nights), status: b.status, roomTotalMinor: Number(b.roomTotalMinor), paidMinor: b.payments.reduce((s, p) => s + Number(p.amountMinor), 0) }));
}
