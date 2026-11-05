import { z } from "zod";
import { zBool, zId, zInt, zJson, zMinor, zOptText, zStringList, zText } from "@/platform/http/zod";

export const categorySchema = z.object({
  id: zId.optional(), name: zText("Name", 60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b"), sortOrder: zInt(0, 9999).default(0),
  isActive: zBool.default(true),
});

export const stationSchema = z.object({ id: zId.optional(), name: zText("Name", 40) });

const variantSchema = z.object({ id: z.string().optional(), name: zText("Variant name", 40), priceMinor: z.number().int().min(0).max(100_000_000_00), isDefault: z.boolean().default(false) });

export const productSchema = z.object({
  id: zId.optional(),
  name: zText("Name", 100),
  categoryId: zId,
  stationId: zOptText(64),
  description: zOptText(400),
  sku: zOptText(40),
  imageUrl: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(500).regex(/^(https:\/\/|\/)[^\s]+$/, "Use an https:// link or a path starting with /").optional()),
  basePriceMinor: zMinor,
  isTaxExempt: zBool.default(false),
  prepMinutes: zInt(0, 240).default(10),
  isActive: zBool.default(true),
  variants: zJson(z.array(variantSchema).max(12)).default([]),
  modifierGroupIds: zStringList.default([]),
});
export type ProductInput = z.infer<typeof productSchema>;

const optionSchema = z.object({ id: z.string().optional(), name: zText("Option name", 40), priceMinor: z.number().int().min(0).max(10_000_000) });
export const modifierGroupSchema = z.object({
  id: zId.optional(), name: zText("Name", 50), minSelect: zInt(0, 20).default(0), maxSelect: zInt(1, 20).default(1),
  options: zJson(z.array(optionSchema).min(1, "Add at least one option.").max(40)),
}).refine((v) => v.maxSelect >= v.minSelect, { message: "Max can't be lower than min.", path: ["maxSelect"] });

export const availabilitySchema = z.object({ branchId: zId, productId: zId, isAvailable: zBool });
export const branchPriceSchema = z.object({ branchId: zId, productId: zId, priceMinor: zMinor.optional() });
export const idSchema = z.object({ id: zId });
