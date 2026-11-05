"use server";
import { defineAction } from "@/platform/http/action";
import { adjustPointsSchema, customerSchema, idSchema, loyaltySettingsSchema, rewardSchema, setActiveSchema } from "./schema";
import * as svc from "./service";

export const saveCustomerAction = defineAction({ schema: customerSchema, permission: "customers.manage", feature: "customers", handler: (ctx, i) => svc.saveCustomer(ctx, i) });
export const setCustomerActiveAction = defineAction({ schema: setActiveSchema, permission: "customers.manage", feature: "customers", handler: async (ctx, i) => { await svc.setCustomerActive(ctx, i.id, i.isActive); return null; } });
export const adjustPointsAction = defineAction({ schema: adjustPointsSchema, permission: "loyalty.manage", feature: "loyalty", handler: (ctx, i) => svc.adjustPoints(ctx, i) });
export const saveRewardAction = defineAction({ schema: rewardSchema, permission: "loyalty.manage", feature: "loyalty", handler: (ctx, i) => svc.saveReward(ctx, i) });
export const deactivateRewardAction = defineAction({ schema: idSchema, permission: "loyalty.manage", feature: "loyalty", handler: async (ctx, i) => { await svc.deactivateReward(ctx, i.id); return null; } });
export const saveLoyaltySettingsAction = defineAction({ schema: loyaltySettingsSchema, permission: "loyalty.manage", feature: "loyalty", handler: async (ctx, i) => { await svc.saveLoyaltySettings(ctx, i); return null; } });
