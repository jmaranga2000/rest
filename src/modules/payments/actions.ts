"use server";
import { defineAction } from "@/platform/http/action";
import * as s from "./service";
import * as z from "./schema";

export const startOrderChargeAction = defineAction({ schema: z.startOrderChargeSchema, permission: "payments.collect", handler: (c, i) => s.startOrderCharge(c, i) });
export const checkOrderChargeAction = defineAction({ schema: z.referenceSchema, permission: "payments.collect", handler: (c, i) => s.checkOrderCharge(c, i.reference) });
/** write:false so a workspace that is read-only because it is unpaid can still pay. */
export const startSubscriptionChargeAction = defineAction({ schema: z.startSubscriptionSchema, permission: "billing.manage", write: false, handler: (c, i) => s.startSubscriptionCharge(c, i) });
