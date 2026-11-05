import { z } from "zod";
import { zBool, zId, zInt, zMinor, zOptText, zStringList, zText } from "@/platform/http/zod";
import { ALL_FEATURES } from "@/platform/tenancy/plans";

export const loginSchema = z.object({ email: z.string().trim().email("Enter a valid email."), password: z.string().min(1, "Enter your password."), code: z.string().trim().max(20).optional() });
export const idSchema = z.object({ id: zId });
export const suspendSchema = z.object({ id: zId, reason: zText("Reason", 300).refine((v) => v.length >= 3, "Give a short reason.") });
export const changePlanSchema = z.object({ id: zId, planCode: zId });
export const extendTrialSchema = z.object({ id: zId, days: zInt(1, 365) });
export const paymentSchema = z.object({
  id: zId, amountMinor: zMinor.refine((n) => n > 0, "Enter the amount received."), method: zText("Method", 30), reference: zOptText(80), planCode: zOptText(40),
});
export const rejectRequestSchema = z.object({ id: zId, reason: zText("Note", 300) });
export const adminSchema = z.object({ name: zText("Name", 80), email: z.string().trim().email("Enter a valid email."), password: z.string() });

const limit = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(100000).nullable());
export const planSchema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{1,30}$/, "Use lowercase letters, numbers, - or _."),
  name: zText("Name", 40), description: zOptText(200),
  priceMinor: zMinor, currency: z.string().trim().toUpperCase().length(3, "Use a 3-letter currency code."),
  billingInterval: z.enum(["month", "year"]), trialDays: zInt(0, 120),
  limitBranches: limit, limitUsers: limit, limitTerminals: limit,
  features: zStringList.pipe(z.array(z.enum(ALL_FEATURES as [string, ...string[]]))),
  highlights: z.preprocess((v) => (typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean) : []), z.array(z.string().max(100)).max(10)),
  sortOrder: zInt(0, 99).default(0), isPublic: zBool.default(false), isActive: zBool.default(false),
});
export const totpConfirmSchema = z.object({ code: z.string().trim().min(6, "Enter the 6-digit code.").max(10) });
export const totpDisableSchema = z.object({ password: z.string().min(1, "Enter your password."), code: z.string().trim().min(6, "Enter a code.").max(20) });
export const unbanSchema = z.object({ ip: z.string().min(3).max(64) });
export const banSchema = z.object({ ip: z.string().trim().min(3).max(64), hours: zInt(1, 24 * 365) });
export const emptyOk = z.object({});
