"use server";
import { defineAction } from "@/platform/http/action";
import * as rooms from "./service";
import { bookingPaymentSchema, bookingSchema, checkOutSchema, idSchema, postOrderSchema, roomSchema, roomStatusSchema, roomTypeSchema } from "./schema";

const F = "rooms" as const;
export const saveRoomTypeAction = defineAction({ schema: roomTypeSchema, feature: F, permission: "rooms.manage", handler: (ctx, i) => rooms.saveRoomType(ctx, i) });
export const removeRoomTypeAction = defineAction({ schema: idSchema, feature: F, permission: "rooms.manage", handler: async (ctx, i) => { await rooms.removeRoomType(ctx, i.id); return null; } });
export const saveRoomAction = defineAction({ schema: roomSchema, feature: F, permission: "rooms.manage", handler: (ctx, i) => rooms.saveRoom(ctx, i) });
export const removeRoomAction = defineAction({ schema: idSchema, feature: F, permission: "rooms.manage", handler: async (ctx, i) => { await rooms.removeRoom(ctx, i.id); return null; } });
export const setRoomStatusAction = defineAction({ schema: roomStatusSchema, feature: F, handler: async (ctx, i) => { await rooms.setRoomStatus(ctx, i.id, i.status); return null; } });
export const regenerateRoomQrAction = defineAction({ schema: idSchema, feature: F, permission: "rooms.manage", handler: async (ctx, i) => { await rooms.regenerateRoomQr(ctx, i.id); return null; } });

export const createBookingAction = defineAction({ schema: bookingSchema, feature: F, permission: "bookings.manage", handler: (ctx, i) => rooms.createBooking(ctx, i) });
export const cancelBookingAction = defineAction({ schema: idSchema, feature: F, permission: "bookings.manage", handler: async (ctx, i) => { await rooms.cancelBooking(ctx, i.id); return null; } });
export const noShowBookingAction = defineAction({ schema: idSchema, feature: F, permission: "bookings.manage", handler: async (ctx, i) => { await rooms.cancelBooking(ctx, i.id, true); return null; } });
export const checkInAction = defineAction({ schema: idSchema, feature: F, permission: "bookings.manage", handler: (ctx, i) => rooms.checkIn(ctx, i.id) });
export const checkOutAction = defineAction({ schema: checkOutSchema, feature: F, permission: "bookings.manage", handler: (ctx, i) => rooms.checkOut(ctx, i.id, { waive: i.waive, reason: i.reason }) });
export const bookingPaymentAction = defineAction({ schema: bookingPaymentSchema, feature: F, permission: "bookings.manage", handler: async (ctx, i) => { await rooms.recordBookingPayment(ctx, i.id, i); return null; } });
export const postOrderToRoomAction = defineAction({ schema: postOrderSchema, feature: F, permission: "bookings.manage", handler: async (ctx, i) => { await rooms.postOrderToRoom(ctx, i.orderId); return null; } });
export const regenerateStayCodeAction = defineAction({ schema: idSchema, feature: F, permission: "bookings.manage", handler: async (ctx, i) => ({ code: await rooms.regenerateStayCode(ctx, i.id) }) });
