import { z } from "zod";
import { zBool, zId, zInt, zMinor, zOptText, zText } from "@/platform/http/zod";

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const customerSchema = z.object({
  id: zId.optional(),
  name: zText("Name", 80),
  phone: zOptText(20),
  email: z.preprocess(emptyToUndef, z.string().trim().email("Enter a valid email.").max(120).optional()),
  notes: zOptText(500),
  isActive: zBool,
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const rewardSchema = z.object({
  id: zId.optional(),
  name: zText("Name", 60),
  pointsCost: zInt(1, 1_000_000),
  kind: z.enum(["amount_off", "percent_off"]),
  /** amount_off: minor units; percent_off: basis points (1000 = 10%). */
  value: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number({ invalid_type_error: "Enter a value." }).int().min(1, "Enter a value.").max(100_000_000)),
  isActive: zBool,
}).refine((r) => r.kind !== "percent_off" || r.value <= 10_000, { message: "A percentage can't exceed 100%.", path: ["value"] });
export type RewardInput = z.infer<typeof rewardSchema>;

export const loyaltySettingsSchema = z.object({
  enabled: zBool,
  earnPointsPer100: zInt(0, 1000),
  pointValueMinor: zMinor,
});

export const adjustPointsSchema = z.object({
  customerId: zId,
  points: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number({ invalid_type_error: "Enter a number of points." }).int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, "Enter a non-zero number.")),
  reason: zText("Reason", 200),
});

export const idSchema = z.object({ id: zId });
export const setActiveSchema = z.object({ id: zId, isActive: zBool });
