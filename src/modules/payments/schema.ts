import { z } from "zod";
import { zBool, zId, zMinor, zOptText } from "@/platform/http/zod";

export const gatewaySchema = z.object({
  orgId: zId,
  publicKey: z.string().trim().min(1, "Enter your Paystack public key."),
  /** Blank keeps the stored secret key. */
  secretKey: zOptText(200),
  enabled: zBool,
});
export const startOrderChargeSchema = z.object({ orderId: zId, amountMinor: zMinor.optional(), email: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().email("Enter a valid email.").optional()) });
export const referenceSchema = z.object({ reference: z.string().min(6).max(80) });
export const startSubscriptionSchema = z.object({ planCode: z.string().min(1).max(40) });
export const orgOnlySchema = z.object({ orgId: zId });
