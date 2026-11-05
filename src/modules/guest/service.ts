import { timingSafeEqual } from "node:crypto";
import type { Db, Doc } from "@/platform/db";
import { newSecret } from "@/platform/ids";
import { BusinessRuleError, NotFoundError } from "@/platform/errors";
import { loadContextForUser, type Ctx } from "@/platform/auth/context";
import { enforceRateLimits } from "@/platform/auth/rate-limit";
import { getCatalog, effectivePrice, type Catalog } from "@/modules/menu/service";
import { addItems, getOrder, openOrder, sendToKitchen } from "@/modules/orders/service";
import type { AddItemInput } from "@/modules/orders/schema";

/**
 * Guest (QR) ordering. The guest is anonymous: the only credential is the unguessable token printed in the QR code.
 * Everything runs through the normal order service using a deliberately narrow context (can take orders and read the menu, nothing else),
 * so a leaked or guessed token can never do more than place an order for that one table.
 */

export const GUEST_LIMITS = { maxLines: 20, maxQty: 10, ordersPerGuestPerHour: 12, ordersPerTokenPerHour: 60, ordersPerIpPerHour: 40 } as const;

export interface GuestTarget {
  kind: "table" | "room"; token: string; orgId: string; branchId: string; targetId: string; label: string;
  /** Rooms only: the checked-in booking this order would be charged to (null = nobody staying, menu is read-only). */
  bookingId?: string | null;
}
export type GuestState =
  | { ok: false; reason: "not_found" | "disabled" | "unavailable" }
  | { ok: true; target: GuestTarget; org: { name: string; logoUrl: string | null; currency: string; locale: string }; branchName: string; orderingOpen: boolean; autoSend: boolean };

type TableDoc = Doc & { branchId: string; label: string; isActive: boolean; qrToken?: string };

export const newQrToken = (): string => newSecret(16);

/** Gives every active table a QR token (lazy, so tables created before this feature keep working). */
export async function ensureTableTokens(db: Db, orgId: string, branchId?: string): Promise<void> {
  const tables = await db.col<TableDoc>("diningTables").find({ orgId, isActive: true, ...(branchId ? { branchId } : {}) });
  for (const t of tables) if (!t.qrToken) await db.col("diningTables").update({ orgId, id: t.id }, { $set: { qrToken: newQrToken() } });
}

async function ownerId(db: Db, orgId: string): Promise<string> {
  const role = await db.col<Doc & { key: string }>("roles").findOne({ orgId, key: "owner" });
  const u = role ? await db.col<Doc>("users").findOne({ orgId, roleId: role.id, status: "active" }) : null;
  if (!u) throw new NotFoundError("Restaurant");
  return u.id;
}

/** A narrow, anonymous context acting on the restaurant's behalf. */
export async function guestCtx(db: Db, orgId: string, branchId: string, source: "qr_table" | "qr_room"): Promise<Ctx> {
  const base = await loadContextForUser(db, orgId, await ownerId(db, orgId));
  const branches = base.branches.filter((b) => b.id === branchId);
  if (!branches.length) throw new NotFoundError("Branch");
  return {
    ...base, db, userName: source === "qr_room" ? "Guest (room QR)" : "Guest (table QR)", sessionKind: "web", sessionId: "guest",
    permissions: new Set(["orders.create", "orders.view", "menu.view"] as const), branches, activeBranch: branches[0]!,
    settings: { ...base.settings, orderTypes: [...new Set([...base.settings.orderTypes, "dine_in" as const, "room_service" as const])], paymentMethods: [...new Set([...base.settings.paymentMethods, "room" as const])] },
  };
}

export async function resolveTable(db: Db, token: string): Promise<GuestState> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { ok: false, reason: "not_found" };
  const t = await db.col<TableDoc & { orgId: string }>("diningTables").findOne({ qrToken: token });
  if (!t || !t.isActive) return { ok: false, reason: "not_found" };
  const [org, sub, branch, settings] = await Promise.all([
    db.col<Doc & { name: string; status: string; logoUrl: string | null; currency: string; locale: string }>("organizations").findOne({ id: t.orgId }),
    db.col<Doc & { status: string }>("subscriptions").findOne({ orgId: t.orgId }),
    db.col<Doc & { name: string; isActive: boolean }>("branches").findOne({ orgId: t.orgId, id: t.branchId }),
    db.col<Doc & { qrOrderingEnabled?: boolean; qrAutoSend?: boolean }>("orgSettings").findOne({ id: t.orgId }),
  ]);
  if (!org || org.status !== "active" || !branch?.isActive || !sub || !["trialing", "active", "past_due"].includes(sub.status)) return { ok: false, reason: "unavailable" };
  const enabled = settings?.qrOrderingEnabled ?? true;
  return {
    ok: true, orderingOpen: enabled, autoSend: settings?.qrAutoSend ?? true, branchName: branch.name,
    org: { name: org.name, logoUrl: org.logoUrl ?? null, currency: org.currency, locale: org.locale },
    target: { kind: "table", token, orgId: t.orgId, branchId: t.branchId, targetId: t.id, label: t.label },
  };
}

export async function resolveRoom(db: Db, token: string): Promise<GuestState> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { ok: false, reason: "not_found" };
  const room = await db.col<Doc & { orgId: string; branchId: string; number: string; isActive: boolean }>("rooms").findOne({ qrToken: token });
  if (!room || !room.isActive) return { ok: false, reason: "not_found" };
  const [org, sub, branch, settings, booking] = await Promise.all([
    db.col<Doc & { name: string; status: string; logoUrl: string | null; currency: string; locale: string }>("organizations").findOne({ id: room.orgId }),
    db.col<Doc & { status: string }>("subscriptions").findOne({ orgId: room.orgId }),
    db.col<Doc & { name: string; isActive: boolean }>("branches").findOne({ orgId: room.orgId, id: room.branchId }),
    db.col<Doc & { qrOrderingEnabled?: boolean; qrAutoSend?: boolean }>("orgSettings").findOne({ id: room.orgId }),
    db.col<Doc>("bookings").findOne({ orgId: room.orgId, roomId: room.id, status: "checked_in" }),
  ]);
  if (!org || org.status !== "active" || !branch?.isActive || !sub || !["trialing", "active", "past_due"].includes(sub.status)) return { ok: false, reason: "unavailable" };
  return {
    ok: true, orderingOpen: (settings?.qrOrderingEnabled ?? true) && !!booking, autoSend: settings?.qrAutoSend ?? true, branchName: branch.name,
    org: { name: org.name, logoUrl: org.logoUrl ?? null, currency: org.currency, locale: org.locale },
    target: { kind: "room", token, orgId: room.orgId, branchId: room.branchId, targetId: room.id, label: room.number, bookingId: booking?.id ?? null },
  };
}

export interface GuestMenu {
  categories: { id: string; name: string }[];
  products: { id: string; categoryId: string; name: string; description: string; imageUrl: string | null; priceMinor: number; variants: { id: string; name: string; priceMinor: number; isDefault: boolean }[];
    groups: { id: string; name: string; minSelect: number; maxSelect: number; options: { id: string; name: string; priceMinor: number }[] }[] }[];
}

/** Public menu: only what a guest may see (no SKUs, stations, costs). */
export async function guestMenu(db: Db, target: GuestTarget): Promise<GuestMenu> {
  const ctx = await guestCtx(db, target.orgId, target.branchId, target.kind === "room" ? "qr_room" : "qr_table");
  const cat: Catalog = await getCatalog(ctx, { branchId: target.branchId });
  const groups = new Map(cat.modifierGroups.map((g) => [g.id, g]));
  const products = cat.products.filter((p) => p.isActive && p.isAvailable).map((p) => ({
    id: p.id, categoryId: p.categoryId, name: p.name, description: p.description ?? "", imageUrl: p.imageUrl, priceMinor: effectivePrice(p),
    variants: p.variants.length > 1 ? p.variants.map((v) => ({ id: v.id, name: v.name, priceMinor: v.priceMinor, isDefault: v.isDefault })) : [],
    groups: p.modifierGroupIds.map((id) => groups.get(id)).filter((g): g is NonNullable<typeof g> => !!g).map((g) => ({ id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, options: g.options.map((o) => ({ id: o.id, name: o.name, priceMinor: o.priceMinor })) })),
  }));
  const used = new Set(products.map((p) => p.categoryId));
  return { categories: cat.categories.filter((c) => c.isActive && used.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ id: c.id, name: c.name })), products };
}

export interface PlaceInput { token: string; guestKey: string; submitKey: string; items: AddItemInput[]; ip: string | null }
export interface GuestOrderStatus { number: string; sentToKitchen: boolean; totalMinor: number; lines: { name: string; variantName: string | null; qty: number; status: string; lineTotalMinor: number }[] }

/** Places (or extends) the table's order. Idempotent per `submitKey`; items are tagged with the guest so each guest only sees their own. */
export async function placeTableOrder(root: Db, i: PlaceInput): Promise<GuestOrderStatus> {
  const state = await resolveTable(root, i.token);
  if (!state.ok) throw new NotFoundError("Table");
  if (!state.orderingOpen) throw new BusinessRuleError("This restaurant isn't taking QR orders right now. Please call a waiter.");
  if (i.items.length < 1 || i.items.length > GUEST_LIMITS.maxLines) throw new BusinessRuleError(`Please order between 1 and ${GUEST_LIMITS.maxLines} items at a time.`);
  if (i.items.some((x) => x.qty > GUEST_LIMITS.maxQty)) throw new BusinessRuleError(`Up to ${GUEST_LIMITS.maxQty} of one item per order. Ask a waiter for larger orders.`);
  const rules = [
    { key: `qr:g:${i.guestKey}`, limit: GUEST_LIMITS.ordersPerGuestPerHour, windowSeconds: 3600 },
    { key: `qr:t:${i.token}`, limit: GUEST_LIMITS.ordersPerTokenPerHour, windowSeconds: 3600 },
    ...(i.ip ? [{ key: `qr:ip:${i.ip}`, limit: GUEST_LIMITS.ordersPerIpPerHour, windowSeconds: 3600 }] : []),
  ];
  await enforceRateLimits(root, rules);
  const t = state.target;

  return root.tx(async (tx) => {
    const dup = await tx.col<Doc & { orderId: string }>("orderItems").findOne({ orgId: t.orgId, guestSubmitKey: i.submitKey });
    if (dup) return guestStatus(tx, t, i.guestKey, dup.orderId);
    const ctx = await guestCtx(tx, t.orgId, t.branchId, "qr_table");
    const open = await tx.col<Doc>("orders").findOne({ orgId: t.orgId, tableId: t.targetId, status: "open" });
    const orderId = open ? open.id : (await openOrder(ctx, { branchId: t.branchId, type: "dine_in", tableId: t.targetId, guests: null, notes: null, customerId: null, clientKey: null }, { source: "qr_table" })).id;
    const created: string[] = [];
    await addItems(ctx, orderId, i.items, { guestKey: i.guestKey, guestSubmitKey: i.submitKey, source: "qr_table" }, created);
    if (state.autoSend) await sendToKitchen(ctx, orderId, { itemIds: created });
    return guestStatus(tx, t, i.guestKey, orderId);
  });
}

export interface PlaceRoomInput extends PlaceInput { stayCode: string }

/** Room service by QR: needs a checked-in guest AND their stay code; items are charged to the booking's folio. */
export async function placeRoomOrder(root: Db, i: PlaceRoomInput): Promise<GuestOrderStatus> {
  const state = await resolveRoom(root, i.token);
  if (!state.ok) throw new NotFoundError("Room");
  const t = state.target;
  if (!t.bookingId) throw new BusinessRuleError("Room service opens once you have checked in at reception.");
  if (!state.orderingOpen) throw new BusinessRuleError("Room service ordering is paused. Please call reception.");
  if (i.items.length < 1 || i.items.length > GUEST_LIMITS.maxLines) throw new BusinessRuleError(`Please order between 1 and ${GUEST_LIMITS.maxLines} items at a time.`);
  if (i.items.some((x) => x.qty > GUEST_LIMITS.maxQty)) throw new BusinessRuleError(`Up to ${GUEST_LIMITS.maxQty} of one item per order. Please call reception for larger orders.`);
  await enforceRateLimits(root, [
    { key: `qr:code:${i.token}`, limit: 15, windowSeconds: 900 }, // every attempt counts, right or wrong: 6-digit code, ~1,400 guesses/day at most
    { key: `qr:g:${i.guestKey}`, limit: GUEST_LIMITS.ordersPerGuestPerHour, windowSeconds: 3600 },
    ...(i.ip ? [{ key: `qr:ip:${i.ip}`, limit: GUEST_LIMITS.ordersPerIpPerHour, windowSeconds: 3600 }] : []),
  ]);
  return root.tx(async (tx) => {
    const booking = await tx.col<Doc & { stayCode: string | null; roomNumber: string }>("bookings").findOne({ orgId: t.orgId, id: t.bookingId!, status: "checked_in" });
    if (!booking || !booking.stayCode || !timingSafeEq(booking.stayCode, i.stayCode)) throw new BusinessRuleError("That code isn't right. Check the number on your check-in slip.");
    const dup = await tx.col<Doc & { orderId: string }>("orderItems").findOne({ orgId: t.orgId, guestSubmitKey: i.submitKey });
    if (dup) return guestStatus(tx, t, i.guestKey, dup.orderId);
    const ctx = await guestCtx(tx, t.orgId, t.branchId, "qr_room");
    const open = await tx.col<Doc>("orders").findOne({ orgId: t.orgId, bookingId: t.bookingId!, status: "open" });
    const orderId = open ? open.id : (await openOrder(ctx, { branchId: t.branchId, type: "room_service" as never, tableId: null, guests: null, notes: `Room ${t.label}`, customerId: null, clientKey: null },
      { source: "qr_room", roomId: t.targetId, bookingId: t.bookingId, roomLabel: t.label })).id;
    const created: string[] = [];
    await addItems(ctx, orderId, i.items, { guestKey: i.guestKey, guestSubmitKey: i.submitKey, source: "qr_room" }, created);
    if (state.autoSend) await sendToKitchen(ctx, orderId, { itemIds: created });
    return guestStatus(tx, t, i.guestKey, orderId);
  });
}
function timingSafeEq(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** What a guest may see about their own items on the table's open order. */
export async function guestStatus(db: Db, t: GuestTarget, guestKey: string, orderId?: string): Promise<GuestOrderStatus> {
  const where = t.kind === "room" ? { orgId: t.orgId, bookingId: t.bookingId ?? "none", status: "open" } : { orgId: t.orgId, tableId: t.targetId, status: "open" };
  const order = orderId ? await db.col<Doc & { number: string; status: string }>("orders").findOne({ orgId: t.orgId, id: orderId }) : await db.col<Doc & { number: string; status: string }>("orders").findOne(where);
  if (!order) return { number: "", sentToKitchen: false, totalMinor: 0, lines: [] };
  const items = (await db.col<Doc & { name: string; variantName: string | null; qty: number; status: string; lineTotalMinor: number; guestKey?: string; createdAt: string }>("orderItems")
    .find({ orgId: t.orgId, orderId: order.id, guestKey })).filter((x) => x.status !== "void").sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return {
    number: order.number, sentToKitchen: items.some((x) => x.status !== "held"),
    totalMinor: items.reduce((s, x) => s + Number(x.lineTotalMinor), 0),
    lines: items.map((x) => ({ name: x.name, variantName: x.variantName, qty: Number(x.qty), status: x.status, lineTotalMinor: Number(x.lineTotalMinor) })),
  };
}

/** Staff-side: rotate a table's QR code (invalidates anything already printed). */
export async function regenerateTableToken(ctx: Ctx, tableId: string): Promise<string> {
  const token = newQrToken();
  const n = await ctx.db.col("diningTables").update({ orgId: ctx.org.id, id: tableId }, { $set: { qrToken: token } });
  if (!n) throw new NotFoundError("Table");
  return token;
}
