import type { Ctx } from "@/platform/auth/context";
import type { Doc } from "@/platform/db";
import { audit } from "@/platform/audit/audit";
import { newId } from "@/platform/ids";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/platform/errors";
import { requireBranch } from "@/platform/rbac/guard";
import { emit } from "@/platform/events/outbox";
import type { ProductInput } from "./schema";
import type { z } from "zod";
import type { categorySchema, modifierGroupSchema, stationSchema } from "./schema";
export { effectivePrice } from "./pricing";

export interface Category { id: string; name: string; color: string; sortOrder: number; isActive: boolean; productCount: number }
export interface Station { id: string; name: string; sortOrder: number }
export interface Variant { id: string; name: string; priceMinor: number; isDefault: boolean }
export interface ModifierOption { id: string; name: string; priceMinor: number }
export interface ModifierGroup { id: string; name: string; minSelect: number; maxSelect: number; options: ModifierOption[]; productCount: number }
export interface CatalogProduct {
  id: string; categoryId: string; categoryName: string; stationId: string | null; stationName: string | null; name: string; description: string;
  sku: string | null; imageUrl: string | null; basePriceMinor: number; isTaxExempt: boolean; prepMinutes: number; isActive: boolean; sortOrder: number;
  variants: Variant[]; modifierGroupIds: string[];
  /** Branch-specific values (null price = uses base price). */
  branchPriceMinor: number | null; isAvailable: boolean;
}
export interface Catalog { categories: Category[]; stations: Station[]; modifierGroups: ModifierGroup[]; products: CatalogProduct[] }

export async function getCatalog(ctx: Ctx, opts: { branchId?: string | null; includeInactive?: boolean } = {}): Promise<Catalog> {
  const db = ctx.db;
  const org = ctx.org.id;
  const branchId = opts.branchId ?? ctx.activeBranch?.id ?? "";
  if (branchId) requireBranch(ctx, branchId);
  const activeOnly = !opts.includeInactive;

  type P = Doc & { categoryId: string; stationId: string | null; name: string; description: string; sku: string | null; imageUrl: string | null; basePriceMinor: number; isTaxExempt: boolean; prepMinutes: number; isActive: boolean; sortOrder: number };
  const [cats, stationDocs, groups, options, links, productDocs, variants, branchRows] = await Promise.all([
    db.col<Doc & { name: string; color: string; sortOrder: number; isActive: boolean }>("menuCategories").find({ orgId: org }),
    db.col<Doc & { name: string; sortOrder: number }>("stations").find({ orgId: org, isActive: true }),
    db.col<Doc & { name: string; minSelect: number; maxSelect: number }>("modifierGroups").find({ orgId: org, isActive: true }, { sort: { name: 1 } }),
    db.col<Doc & { groupId: string; name: string; priceMinor: number; sortOrder: number }>("modifierOptions").find({ orgId: org, isActive: true }),
    db.col<Doc & { productId: string; groupId: string; sortOrder: number }>("productModifierGroups").find({ orgId: org }, { sort: { sortOrder: 1 } }),
    db.col<P>("products").find({ orgId: org, ...(activeOnly ? { isActive: true } : {}) }),
    db.col<Doc & { productId: string; name: string; priceMinor: number; isDefault: boolean; sortOrder: number }>("productVariants").find({ orgId: org }, { sort: { sortOrder: 1 } }),
    branchId ? db.col<Doc & { productId: string; priceMinor: number | null; isAvailable: boolean }>("branchProducts").find({ orgId: org, branchId }) : Promise.resolve([]),
  ]);

  const catById = new Map(cats.map((c) => [c.id, c]));
  const stationsSorted = [...stationDocs].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const stationById = new Map(stationDocs.map((s) => [s.id, s]));
  const countByGroup = new Map<string, number>();
  for (const l of links) countByGroup.set(l.groupId, (countByGroup.get(l.groupId) ?? 0) + 1);

  const optsByGroup = new Map<string, ModifierOption[]>();
  for (const o of [...options].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) (optsByGroup.get(o.groupId) ?? optsByGroup.set(o.groupId, []).get(o.groupId)!).push({ id: o.id, name: o.name, priceMinor: Number(o.priceMinor) });
  const varsByProduct = new Map<string, Variant[]>();
  for (const v of variants) (varsByProduct.get(v.productId) ?? varsByProduct.set(v.productId, []).get(v.productId)!).push({ id: v.id, name: v.name, priceMinor: Number(v.priceMinor), isDefault: v.isDefault });
  const groupsByProduct = new Map<string, string[]>();
  for (const l of links) (groupsByProduct.get(l.productId) ?? groupsByProduct.set(l.productId, []).get(l.productId)!).push(l.groupId);
  const branchByProduct = new Map(branchRows.map((b) => [b.productId, b]));

  const products = productDocs
    .filter((p) => catById.has(p.categoryId) && (!activeOnly || catById.get(p.categoryId)!.isActive))
    .sort((a, b) => {
      const ca = catById.get(a.categoryId)!, cb = catById.get(b.categoryId)!;
      return ca.sortOrder - cb.sortOrder || ca.name.localeCompare(cb.name) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    });

  return {
    categories: [...cats].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, color: c.color, sortOrder: Number(c.sortOrder), isActive: c.isActive, productCount: (productDocs.filter((p) => p.categoryId === c.id && p.isActive)).length })),
    stations: stationsSorted.map((s) => ({ id: s.id, name: s.name, sortOrder: Number(s.sortOrder) })),
    modifierGroups: groups.map((g) => ({ id: g.id, name: g.name, minSelect: Number(g.minSelect), maxSelect: Number(g.maxSelect), options: optsByGroup.get(g.id) ?? [], productCount: countByGroup.get(g.id) ?? 0 })),
    products: products.map((p) => {
      const b = branchByProduct.get(p.id);
      return {
        id: p.id, categoryId: p.categoryId, categoryName: catById.get(p.categoryId)!.name, stationId: p.stationId ?? null, stationName: p.stationId ? stationById.get(p.stationId)?.name ?? null : null,
        name: p.name, description: p.description, sku: p.sku ?? null, imageUrl: p.imageUrl ?? null, basePriceMinor: Number(p.basePriceMinor), isTaxExempt: p.isTaxExempt, prepMinutes: Number(p.prepMinutes),
        isActive: p.isActive, sortOrder: Number(p.sortOrder), variants: varsByProduct.get(p.id) ?? [], modifierGroupIds: groupsByProduct.get(p.id) ?? [],
        branchPriceMinor: b?.priceMinor == null ? null : Number(b.priceMinor), isAvailable: b ? b.isAvailable : true,
      };
    }),
  };
}

export async function getProduct(ctx: Ctx, id: string): Promise<CatalogProduct> {
  const catalog = await getCatalog(ctx, { includeInactive: true });
  const p = catalog.products.find((x) => x.id === id);
  if (!p) throw new NotFoundError("Item");
  return p;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Categories & stations
// ---------------------------------------------------------------------------
export async function saveCategory(ctx: Ctx, input: z.infer<typeof categorySchema>): Promise<{ id: string }> {
  const now = new Date().toISOString();
  const all = await ctx.db.col<Doc & { name: string; sortOrder: number }>("menuCategories").find({ orgId: ctx.org.id });
  if (all.some((c) => c.id !== input.id && sameName(c.name, input.name))) throw new ConflictError(`A category named "${input.name}" already exists.`);
  if (input.id) {
    const n = await ctx.db.col("menuCategories").update({ orgId: ctx.org.id, id: input.id }, { $set: { name: input.name, color: input.color, sortOrder: input.sortOrder, isActive: input.isActive, updatedAt: now } });
    if (!n) throw new NotFoundError("Category");
    await audit(ctx, { action: "menu.category.updated", entityType: "category", entityId: input.id, summary: `Updated category "${input.name}"` });
    return { id: input.id };
  }
  const id = newId("category");
  const max = all.reduce((m, c) => Math.max(m, Number(c.sortOrder)), 0);
  await ctx.db.col("menuCategories").insert({ id, orgId: ctx.org.id, name: input.name, color: input.color, sortOrder: input.sortOrder || max + 1, isActive: input.isActive, createdAt: now, updatedAt: now });
  await audit(ctx, { action: "menu.category.created", entityType: "category", entityId: id, summary: `Created category "${input.name}"` });
  return { id };
}

export async function deleteCategory(ctx: Ctx, id: string): Promise<void> {
  const used = await ctx.db.col("products").count({ orgId: ctx.org.id, categoryId: id });
  if (used > 0) throw new BusinessRuleError("This category still has items. Move or archive them first, or hide the category instead.");
  const n = await ctx.db.col("menuCategories").delete({ orgId: ctx.org.id, id });
  if (!n) throw new NotFoundError("Category");
  await audit(ctx, { action: "menu.category.deleted", entityType: "category", entityId: id, summary: "Deleted a category" });
}

export async function saveStation(ctx: Ctx, input: z.infer<typeof stationSchema>): Promise<{ id: string }> {
  const all = await ctx.db.col<Doc & { name: string }>("stations").find({ orgId: ctx.org.id });
  if (all.some((s) => s.id !== input.id && sameName(s.name, input.name))) throw new ConflictError(`A station named "${input.name}" already exists.`);
  if (input.id) {
    const n = await ctx.db.col("stations").update({ orgId: ctx.org.id, id: input.id }, { $set: { name: input.name } });
    if (!n) throw new NotFoundError("Station");
    return { id: input.id };
  }
  const id = newId("station");
  await ctx.db.col("stations").insert({ id, orgId: ctx.org.id, name: input.name, createdAt: new Date().toISOString() });
  await audit(ctx, { action: "menu.station.created", entityType: "station", entityId: id, summary: `Created kitchen station "${input.name}"` });
  return { id };
}

export async function deleteStation(ctx: Ctx, id: string): Promise<void> {
  await ctx.db.col("products").update({ orgId: ctx.org.id, stationId: id }, { $set: { stationId: null } });
  await ctx.db.col("stations").update({ orgId: ctx.org.id, id }, { $set: { isActive: false } });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export async function saveProduct(ctx: Ctx, input: ProductInput): Promise<{ id: string }> {
  const org = ctx.org.id;
  const now = new Date().toISOString();
  const cat = await ctx.db.col("menuCategories").findOne({ orgId: org, id: input.categoryId });
  if (!cat) throw new NotFoundError("Category");
  if (input.stationId && !(await ctx.db.col("stations").findOne({ orgId: org, id: input.stationId }))) throw new NotFoundError("Station");
  if (input.sku) {
    const dup = await ctx.db.col("products").findOne({ orgId: org, sku: input.sku, id: { $ne: input.id ?? "" } });
    if (dup) throw new ConflictError(`SKU "${input.sku}" is already used by another item.`);
  }
  const variants = input.variants.map((v, i) => ({ ...v, sortOrder: i }));
  if (variants.length && !variants.some((v) => v.isDefault)) variants[0]!.isDefault = true;
  if (variants.filter((v) => v.isDefault).length > 1) throw new BusinessRuleError("Only one variant can be the default.");

  const id = input.id ?? newId("product");
  const row = {
    categoryId: input.categoryId, stationId: input.stationId ?? null, name: input.name, description: input.description ?? "", sku: input.sku ?? null, imageUrl: input.imageUrl ?? null,
    basePriceMinor: input.basePriceMinor, isTaxExempt: input.isTaxExempt, prepMinutes: input.prepMinutes, isActive: input.isActive, updatedAt: now,
  };
  if (input.id) {
    const before = await ctx.db.col<Doc & { basePriceMinor: number; name: string }>("products").findOne({ orgId: org, id });
    if (!before) throw new NotFoundError("Item");
    await ctx.db.col("products").update({ orgId: org, id }, { $set: row });
    const priceNote = Number(before.basePriceMinor) !== input.basePriceMinor ? ` (price ${before.basePriceMinor} → ${input.basePriceMinor} minor units)` : "";
    await audit(ctx, { action: "menu.product.updated", entityType: "product", entityId: id, summary: `Updated "${input.name}"${priceNote}` });
  } else {
    await ctx.db.col("products").insert({ id, orgId: org, ...row, createdAt: now });
    await audit(ctx, { action: "menu.product.created", entityType: "product", entityId: id, summary: `Created item "${input.name}"` });
  }

  // Variants: keep ids stable for existing ones (order history references them by snapshot, but ids help the POS).
  const vcol = ctx.db.col("productVariants");
  const existing = new Set((await vcol.find({ orgId: org, productId: id })).map((v) => v.id));
  const keep = new Set<string>();
  for (const v of variants) {
    if (v.id && existing.has(v.id)) {
      keep.add(v.id);
      await vcol.update({ orgId: org, id: v.id }, { $set: { name: v.name, priceMinor: v.priceMinor, isDefault: v.isDefault, sortOrder: v.sortOrder } });
    } else {
      await vcol.insert({ id: newId("variant"), orgId: org, productId: id, name: v.name, priceMinor: v.priceMinor, isDefault: v.isDefault, sortOrder: v.sortOrder });
    }
  }
  const drop = [...existing].filter((x) => !keep.has(x));
  if (drop.length) await vcol.delete({ orgId: org, id: { $in: drop } });

  await ctx.db.col("productModifierGroups").delete({ orgId: org, productId: id });
  for (const [i, g] of [...new Set(input.modifierGroupIds)].entries()) await ctx.db.col("productModifierGroups").insert({ id: `${id}:${g}`, orgId: org, productId: id, groupId: g, sortOrder: i });
  return { id };
}

/** Items are never hard-deleted once ordered; archiving hides them from the POS but keeps history intact. */
export async function archiveProduct(ctx: Ctx, id: string, archived: boolean): Promise<void> {
  const n = await ctx.db.col("products").update({ orgId: ctx.org.id, id }, { $set: { isActive: !archived, updatedAt: new Date().toISOString() } });
  if (!n) throw new NotFoundError("Item");
  await audit(ctx, { action: archived ? "menu.product.archived" : "menu.product.restored", entityType: "product", entityId: id, summary: archived ? "Archived an item" : "Restored an item" });
}

// ---------------------------------------------------------------------------
// Modifier groups
// ---------------------------------------------------------------------------
export async function saveModifierGroup(ctx: Ctx, input: z.infer<typeof modifierGroupSchema>): Promise<{ id: string }> {
  const org = ctx.org.id;
  if (input.minSelect > input.options.length) throw new BusinessRuleError("Minimum selections can't exceed the number of options.");
  const id = input.id ?? newId("modGroup");
  if (input.id) {
    const n = await ctx.db.col("modifierGroups").update({ orgId: org, id }, { $set: { name: input.name, minSelect: input.minSelect, maxSelect: input.maxSelect } });
    if (!n) throw new NotFoundError("Modifier group");
  } else {
    await ctx.db.col("modifierGroups").insert({ id, orgId: org, name: input.name, minSelect: input.minSelect, maxSelect: input.maxSelect });
  }
  const ocol = ctx.db.col("modifierOptions");
  const existing = new Set((await ocol.find({ orgId: org, groupId: id })).map((o) => o.id));
  const keep = new Set<string>();
  for (const [i, o] of input.options.entries()) {
    if (o.id && existing.has(o.id)) {
      keep.add(o.id);
      await ocol.update({ orgId: org, id: o.id }, { $set: { name: o.name, priceMinor: o.priceMinor, sortOrder: i, isActive: true } });
    } else {
      await ocol.insert({ id: newId("modOption"), orgId: org, groupId: id, name: o.name, priceMinor: o.priceMinor, sortOrder: i });
    }
  }
  // Removed options are deactivated, not deleted, so past orders keep their snapshot readable.
  const gone = [...existing].filter((x) => !keep.has(x));
  if (gone.length) await ocol.update({ orgId: org, id: { $in: gone } }, { $set: { isActive: false } });
  await audit(ctx, { action: input.id ? "menu.modifier.updated" : "menu.modifier.created", entityType: "modifier_group", entityId: id, summary: `Saved modifier group "${input.name}"` });
  return { id };
}

export async function deleteModifierGroup(ctx: Ctx, id: string): Promise<void> {
  await ctx.db.col("productModifierGroups").delete({ orgId: ctx.org.id, groupId: id });
  await ctx.db.col("modifierGroups").update({ orgId: ctx.org.id, id }, { $set: { isActive: false } });
  await audit(ctx, { action: "menu.modifier.deleted", entityType: "modifier_group", entityId: id, summary: "Deleted a modifier group" });
}

// ---------------------------------------------------------------------------
// Branch availability & pricing
// ---------------------------------------------------------------------------
async function upsertBranchProduct(ctx: Ctx, branchId: string, productId: string, patch: { isAvailable?: boolean; priceMinor?: number | null }) {
  requireBranch(ctx, branchId);
  const p = await ctx.db.col("products").findOne({ orgId: ctx.org.id, id: productId });
  if (!p) throw new NotFoundError("Item");
  const now = new Date().toISOString();
  const col = ctx.db.col<Doc & { priceMinor: number | null; isAvailable: boolean }>("branchProducts");
  const id = `${branchId}:${productId}`;
  const cur = await col.findOne({ id });
  if (!cur) {
    await col.insert({ id, orgId: ctx.org.id, branchId, productId, priceMinor: patch.priceMinor ?? null, isAvailable: patch.isAvailable ?? true, updatedAt: now });
  } else {
    await col.update({ id }, { $set: { priceMinor: patch.priceMinor === undefined ? cur.priceMinor : patch.priceMinor, isAvailable: patch.isAvailable ?? cur.isAvailable, updatedAt: now } });
  }
}

/** "86" an item for the rest of service (or bring it back). Pushed live to POS screens. */
export async function setAvailability(ctx: Ctx, branchId: string, productId: string, isAvailable: boolean): Promise<void> {
  await upsertBranchProduct(ctx, branchId, productId, { isAvailable });
  await audit(ctx, { action: "menu.availability", entityType: "product", entityId: productId, branchId, summary: isAvailable ? "Marked an item available" : "Marked an item sold out" });
  await emit(ctx.db, { orgId: ctx.org.id, branchId, topic: "orders", type: "menu.availability", payload: { productId, isAvailable } });
}

export async function setBranchPrice(ctx: Ctx, branchId: string, productId: string, priceMinor: number | null): Promise<void> {
  await upsertBranchProduct(ctx, branchId, productId, { priceMinor });
  await audit(ctx, { action: "menu.branch_price", entityType: "product", entityId: productId, branchId, summary: priceMinor == null ? "Cleared a branch price override" : "Set a branch price override" });
}
