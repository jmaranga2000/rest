import { z } from "zod";
import { zMinor, zMinor as moneyMinor, zId } from "@/platform/http/zod";

export const ORDER_TYPES = ["dine_in", "takeaway", "delivery", "pickup"] as const;
export const METHODS = ["cash", "mpesa", "card", "paystack", "bank", "voucher", "other"] as const;

export const openOrderSchema = z.object({
  branchId: zId, type: z.enum(ORDER_TYPES), tableId: zId.nullish(), customerId: zId.nullish(),
  guests: z.coerce.number().int().min(1).max(500).nullish(), notes: z.string().trim().max(500).nullish(), clientKey: z.string().trim().max(64).nullish(),
});
export type OpenOrderInput = z.infer<typeof openOrderSchema>;

export const addItemSchema = z.object({
  productId: zId, variantId: zId.nullish(), qty: z.coerce.number().int().min(1).max(999), note: z.string().trim().max(200).nullish(), optionIds: z.array(zId).max(40).optional(),
});
export type AddItemInput = z.infer<typeof addItemSchema>;
export const addItemsSchema = z.object({ orderId: zId, items: z.array(addItemSchema).min(1).max(60) });

export const paySchema = z.object({
  orderId: zId, method: z.enum(METHODS), amountMinor: moneyMinor.refine((n) => n > 0, "Amount must be positive"),
  tenderedMinor: moneyMinor.nullish(), tipMinor: moneyMinor.nullish(), reference: z.string().trim().max(80).nullish(), clientKey: z.string().trim().max(64).nullish(),
});
export type PayInput = z.infer<typeof paySchema>;

const reason = z.string().trim().min(3, "Give a short reason.").max(200);
export const orderIdSchema = z.object({ orderId: zId });
export const itemIdSchema = z.object({ itemId: zId });
export const updateItemSchema = z.object({ itemId: zId, qty: z.coerce.number().int().min(1).max(999).optional(), note: z.string().trim().max(200).nullish() });
export const itemStatusSchema = z.object({ itemId: zId, status: z.enum(["preparing", "ready", "served"]) });
export const bumpSchema = z.object({ orderId: zId, status: z.enum(["preparing", "ready", "served"]) });
export const voidItemSchema = z.object({ itemId: zId, reason });
export const voidOrderSchema = z.object({ orderId: zId, reason });
export const discountSchema = z.object({ orderId: zId, kind: z.enum(["percent", "amount"]).nullable(), value: z.coerce.number().int().min(0).default(0), reason: z.string().trim().max(200).default("") })
  .refine((d) => d.kind === null || d.reason.length >= 3, { path: ["reason"], message: "Give a short reason." });
export const customerSchema = z.object({ orderId: zId, customerId: zId.nullable() });
export const rewardSchema = z.object({ orderId: zId, rewardId: zId });
export const transferSchema = z.object({ orderId: zId, tableId: zId });
export const refundSchema = z.object({ paymentId: zId, amountMinor: zMinor.refine((n) => n > 0, "Enter an amount."), reason });
export const openShiftSchema = z.object({ branchId: zId, openingFloatMinor: zMinor });
export const closeShiftSchema = z.object({ shiftId: zId, countedCashMinor: zMinor, note: z.string().trim().max(300).nullish() });
export const cashMoveSchema = z.object({ shiftId: zId, type: z.enum(["pay_in", "pay_out"]), amountMinor: zMinor.refine((n) => n > 0, "Enter an amount."), reason });
