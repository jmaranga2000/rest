import { z } from "zod";
import { zBool, zId, zInt, zMinor, zOptText, zText } from "@/platform/http/zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.").refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Pick a valid date.");

export const roomTypeSchema = z.object({
  id: zId.optional(), name: zText("Name", 60), description: zOptText(300), baseRateMinor: zMinor, capacity: zInt(1, 20),
  amenities: z.preprocess((v) => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v ?? []), z.array(z.string().max(40)).max(20)),
});
export const roomSchema = z.object({
  id: zId.optional(), branchId: zId, number: zText("Room number", 20), floor: zOptText(20), roomTypeId: zId,
  status: z.enum(["ready", "cleaning", "maintenance"]).default("ready"),
});
export const bookingSchema = z.object({
  branchId: zId, roomId: zId, guestName: zText("Guest name", 120), guestPhone: zOptText(40), guestEmail: zOptText(120), adults: zInt(1, 20).default(1),
  checkIn: date, checkOut: date, rateMinor: zMinor.optional(), notes: zOptText(500),
});
export const idSchema = z.object({ id: zId });
export const bookingPaymentSchema = z.object({ id: zId, method: z.enum(["cash", "card", "mpesa", "bank", "other"]), amountMinor: zMinor.refine((n) => n > 0, "Enter an amount."), reference: zOptText(80) });
export const checkOutSchema = z.object({ id: zId, waive: zBool.optional(), reason: zOptText(200) });
export const roomStatusSchema = z.object({ id: zId, status: z.enum(["ready", "cleaning", "maintenance"]) });
export const availabilitySchema = z.object({ branchId: zId, checkIn: date, checkOut: date });
export const regenSchema = z.object({ id: zId, what: z.enum(["qr", "code"]) });
export const postOrderSchema = z.object({ orderId: zId });
export { date as zDate };
