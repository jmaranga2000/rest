import { z } from "zod";
import { zBool, zId, zMinor, zOptText, zText } from "@/platform/http/zod";
import { BASE_UNITS, isDisplayUnit, parseQty, baseOf, type DisplayUnit } from "./units";


export const itemSchema = z.object({
  id: zId.optional(), name: zText("Name", 80), sku: zOptText(40), category: z.preprocess((v) => (v ? v : "General"), z.string().trim().max(40)),
  unit: z.enum(BASE_UNITS as unknown as [string, ...string[]]), supplierId: z.preprocess((v) => (v === "" ? null : v), zId.nullable().optional()),
  branchId: zId, reorderQty: z.preprocess((v) => (v === "" || v == null ? "0" : String(v)), z.string()), parQty: z.preprocess((v) => (v === "" || v == null ? "0" : String(v)), z.string()),
  displayUnit: z.string().refine(isDisplayUnit),
  openingQty: z.preprocess((v) => (v === "" || v == null ? "0" : String(v)), z.string()), openingCostMinor: zMinor.optional(),
}).transform((v, ctx) => {
  const du = v.displayUnit as DisplayUnit;
  if (baseOf(du) !== v.unit) { ctx.addIssue({ code: "custom", path: ["displayUnit"], message: "Unit doesn't match." }); return z.NEVER; }
  const p = (s: string, path: string) => { const m = parseQty(s, du); if (m === null) { ctx.addIssue({ code: "custom", path: [path], message: "Enter a number." }); return 0; } return m; };
  return { ...v, unit: v.unit as "g" | "ml" | "pcs", reorderMilli: p(v.reorderQty, "reorderQty"), parMilli: p(v.parQty, "parQty"), openingMilli: p(v.openingQty, "openingQty") };
});
export type ItemInput = z.infer<typeof itemSchema>;

export const movementSchema = z.object({
  branchId: zId, itemId: zId, kind: z.enum(["receive", "waste", "adjust_up", "adjust_down"]), displayUnit: z.string().refine(isDisplayUnit),
  qty: z.preprocess((v) => String(v ?? ""), z.string()), totalCostMinor: zMinor.optional(), reason: z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(200)),
});
export const recipeSchema = z.object({ productId: zId, lines: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "[]") : v), z.array(z.object({ itemId: zId, qtyMilli: z.number().int().positive() })).max(40)) });
export const supplierSchema = z.object({ id: zId.optional(), name: zText("Name", 80), contact: zOptText(80), phone: zOptText(30), email: zOptText(120), address: zOptText(200), notes: zOptText(300), isActive: zBool.optional() });
export const poSchema = z.object({
  id: zId.optional(), branchId: zId, supplierId: zId, expectedOn: zOptText(10), notes: zOptText(300),
  lines: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "[]") : v), z.array(z.object({ itemId: zId, qtyMilli: z.number().int().positive(), lineTotalMinor: z.number().int().min(0) })).min(1, "Add at least one line.").max(100)),
});
export const poIdSchema = z.object({ id: zId });
export const receiveSchema = z.object({ id: zId, lines: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "[]") : v), z.array(z.object({ lineId: zId, qtyMilli: z.number().int().min(0), totalMinor: z.number().int().min(0) })).min(1)) });
export const idSchema = z.object({ id: zId });
