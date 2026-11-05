import { z } from "zod";
import { zBool, zId, zInt, zMinor, zOptText, zStringList, zText } from "@/platform/http/zod";
import { PIN_PATTERN } from "@/platform/auth/password";

export const idSchema = z.object({ id: zId });
export const areaSchema = z.object({ id: zId.optional(), branchId: zId, name: zText("Name", 60) });
export const tableSchema = z.object({ id: zId.optional(), branchId: zId, areaId: z.preprocess((v) => (v === "" ? null : v), zId.nullable().optional()), label: zText("Label", 20), seats: zInt(1, 100) });

const email = z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.string().email("Enter a valid email address.").max(160));
export const staffSchema = z.object({
  id: zId.optional(), name: zText("Name", 80), roleId: zId, branchIds: zStringList,
  email: z.preprocess((v) => (v === "" || v == null ? undefined : v), email.optional()),
  password: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(200).optional()),
  pin: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(PIN_PATTERN, "PIN must be 4–6 digits.").optional()),
  phone: zOptText(30),
});
export const staffStatusSchema = z.object({ id: zId, status: z.enum(["active", "disabled"]) });
export const inviteSchema = z.object({ email, name: zOptText(80), roleId: zId, branchIds: zStringList });
export const acceptInviteSchema = z.object({ token: z.string().min(10).max(200), name: zText("Name", 80), password: z.string().min(1).max(200) });

export const roleSchema = z.object({ id: zId.optional(), name: zText("Name", 60), description: zOptText(200), allBranches: zBool, permissions: zStringList });
export const branchSchema = z.object({ id: zId.optional(), name: zText("Name", 80), code: zText("Code", 12), address: zOptText(200), city: zOptText(80), phone: zOptText(30), timezone: zOptText(60), isActive: zBool.optional() });
export const terminalSchema = z.object({ branchId: zId, name: zText("Name", 60), kind: z.enum(["pos", "kds"]) });
export const settingsSchema = z.object({
  taxLabel: zText("Tax label", 20), taxRatePercent: z.preprocess((v) => Number(v), z.number().min(0).max(100)), taxInclusive: zBool,
  serviceChargePercent: z.preprocess((v) => Number(v || 0), z.number().min(0).max(100)), serviceChargeTaxable: zBool,
  serviceChargeTypes: zStringList, orderTypes: zStringList.pipe(z.array(z.enum(["dine_in", "takeaway", "delivery", "pickup"])).min(1, "Enable at least one order type.")),
  paymentMethods: zStringList.pipe(z.array(z.enum(["cash", "mpesa", "card", "paystack", "bank", "voucher", "other"])).min(1, "Enable at least one payment method.")),
  requireShiftForCash: zBool, allowNegativeStock: zBool, kitchenLateMinutes: zInt(1, 240), receiptHeader: zOptText(300), receiptFooter: zOptText(300),
});
export const orgProfileSchema = z.object({ name: zText("Business name", 80), currency: z.string().length(3), timezone: zText("Timezone", 60) });
export const planRequestSchema = z.object({ toPlan: zText("Plan", 40), note: zOptText(300) });
export type StaffInput = z.infer<typeof staffSchema>;

export const onboardingSchema = z.object({
  currency: z.string().length(3), timezone: zText("Timezone", 60), taxRatePercent: z.preprocess((v) => Number(v || 0), z.number().min(0).max(100)), taxInclusive: zBool,
  tableCount: zInt(0, 100), sampleMenu: zBool,
});

export const slideSchema = z.object({
  id: zId.optional(), branchId: z.preprocess((v) => (v === "" ? null : v), zId.nullable().optional()), title: zText("Title", 80), body: zOptText(240),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour.").default("#4338ca"), durationS: zInt(3, 120), isActive: zBool.optional(),
});
