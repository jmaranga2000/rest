"use server";
import { defineAction } from "@/platform/http/action";
import { zBool } from "@/platform/http/zod";
import { availabilitySchema, branchPriceSchema, categorySchema, idSchema, modifierGroupSchema, productSchema, stationSchema } from "./schema";
import * as menu from "./service";

export const saveCategoryAction = defineAction({ schema: categorySchema, permission: "menu.manage", handler: (ctx, i) => menu.saveCategory(ctx, i) });
export const deleteCategoryAction = defineAction({ schema: idSchema, permission: "menu.manage", handler: async (ctx, i) => { await menu.deleteCategory(ctx, i.id); return null; } });
export const saveStationAction = defineAction({ schema: stationSchema, permission: "menu.manage", handler: (ctx, i) => menu.saveStation(ctx, i) });
export const deleteStationAction = defineAction({ schema: idSchema, permission: "menu.manage", handler: async (ctx, i) => { await menu.deleteStation(ctx, i.id); return null; } });
export const saveProductAction = defineAction({ schema: productSchema, permission: "menu.manage", handler: (ctx, i) => menu.saveProduct(ctx, i) });
export const archiveProductAction = defineAction({ schema: idSchema.extend({ archived: zBool }), permission: "menu.manage", handler: async (ctx, i) => { await menu.archiveProduct(ctx, i.id, i.archived); return null; } });
export const saveModifierGroupAction = defineAction({ schema: modifierGroupSchema, permission: "menu.manage", handler: (ctx, i) => menu.saveModifierGroup(ctx, i) });
export const deleteModifierGroupAction = defineAction({ schema: idSchema, permission: "menu.manage", handler: async (ctx, i) => { await menu.deleteModifierGroup(ctx, i.id); return null; } });
export const setAvailabilityAction = defineAction({ schema: availabilitySchema, permission: "menu.availability", handler: async (ctx, i) => { await menu.setAvailability(ctx, i.branchId, i.productId, i.isAvailable); return null; } });
export const setBranchPriceAction = defineAction({ schema: branchPriceSchema, permission: "menu.manage", handler: async (ctx, i) => { await menu.setBranchPrice(ctx, i.branchId, i.productId, i.priceMinor ?? null); return null; } });
