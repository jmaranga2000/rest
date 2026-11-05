import { z } from "zod";
import { zBool } from "@/platform/http/zod";
import { addItemSchema } from "@/modules/orders/schema";

const key = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid session.");
export const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) });
export const placeSchema = z.object({
  token: tokenSchema.shape.token, guestKey: key, submitKey: key,
  items: z.array(addItemSchema.pick({ productId: true, variantId: true, qty: true, note: true, optionIds: true })).min(1).max(20),
});
export const statusSchema = z.object({ token: tokenSchema.shape.token, guestKey: key });
export const qrSettingsSchema = z.object({ qrOrderingEnabled: zBool, qrAutoSend: zBool });
export const tableIdSchema = z.object({ id: z.string().min(1).max(64) });
export const placeRoomSchema = placeSchema.extend({ stayCode: z.string().regex(/^\d{3,8}$/, "Enter the numeric code from your check-in slip.") });
