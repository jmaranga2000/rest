"use server";
import { defineAction } from "@/platform/http/action";
import * as s from "./service";
import * as z from "./schema";

const F = "inventory" as const;
export const saveItemAction = defineAction({ schema: z.itemSchema, permission: "inventory.manage", feature: F, handler: (c, i) => s.saveItem(c, i) });
export const archiveItemAction = defineAction({ schema: z.idSchema, permission: "inventory.manage", feature: F, handler: async (c, i) => { await s.archiveItem(c, i.id); return null; } });
export const movementAction = defineAction({ schema: z.movementSchema, permission: "inventory.adjust", feature: F, handler: (c, i) => s.recordMovement(c, i) });
export const setRecipeAction = defineAction({ schema: z.recipeSchema, permission: "inventory.manage", feature: F, handler: async (c, i) => { await s.setRecipe(c, i.productId, i.lines); return null; } });
export const saveSupplierAction = defineAction({ schema: z.supplierSchema, permission: "purchasing.manage", feature: "purchasing", handler: (c, i) => s.saveSupplier(c, i) });
export const savePoAction = defineAction({ schema: z.poSchema, permission: "purchasing.manage", feature: "purchasing", handler: (c, i) => s.savePurchaseOrder(c, i) });
export const orderPoAction = defineAction({ schema: z.poIdSchema, permission: "purchasing.manage", feature: "purchasing", handler: async (c, i) => { await s.markOrdered(c, i.id); return null; } });
export const cancelPoAction = defineAction({ schema: z.poIdSchema, permission: "purchasing.manage", feature: "purchasing", handler: async (c, i) => { await s.cancelPo(c, i.id); return null; } });
export const receivePoAction = defineAction({ schema: z.receiveSchema, permission: "purchasing.receive", feature: "purchasing", handler: (c, i) => s.receivePo(c, i) });
