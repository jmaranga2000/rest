"use server";
import { defineAction } from "@/platform/http/action";
import * as s from "./service";
import * as z from "./schema";

export const openOrderAction = defineAction({ schema: z.openOrderSchema, permission: "orders.create", handler: (c, i) => s.openOrder(c, i) });
export const addItemsAction = defineAction({ schema: z.addItemsSchema, permission: "orders.create", handler: (c, i) => s.addItems(c, i.orderId, i.items) });
export const updateItemAction = defineAction({ schema: z.updateItemSchema, permission: "orders.create", handler: (c, i) => s.updateItem(c, i.itemId, { qty: i.qty, note: i.note }) });
export const removeItemAction = defineAction({ schema: z.itemIdSchema, permission: "orders.create", handler: (c, i) => s.removeHeldItem(c, i.itemId) });
export const sendToKitchenAction = defineAction({ schema: z.orderIdSchema, permission: "orders.create", handler: (c, i) => s.sendToKitchen(c, i.orderId) });
export const itemStatusAction = defineAction({ schema: z.itemStatusSchema, handler: async (c, i) => { await s.setItemStatus(c, i.itemId, i.status); return null; } });
export const bumpOrderAction = defineAction({ schema: z.bumpSchema, handler: async (c, i) => { await s.bumpOrder(c, i.orderId, i.status); return null; } });
export const voidItemAction = defineAction({ schema: z.voidItemSchema, permission: "orders.void", handler: (c, i) => s.voidItem(c, i.itemId, i.reason) });
export const voidOrderAction = defineAction({ schema: z.voidOrderSchema, permission: "orders.void", handler: (c, i) => s.voidOrder(c, i.orderId, i.reason) });
export const discountAction = defineAction({ schema: z.discountSchema, permission: "orders.discount", handler: (c, i) => s.applyDiscount(c, i.orderId, i.kind ? { kind: i.kind, value: i.value, reason: i.reason } : null) });
export const setCustomerAction = defineAction({ schema: z.customerSchema, permission: "orders.edit", handler: (c, i) => s.setCustomer(c, i.orderId, i.customerId) });
export const applyRewardAction = defineAction({ schema: z.rewardSchema, permission: "orders.discount", handler: (c, i) => s.applyLoyaltyReward(c, i.orderId, i.rewardId) });
export const transferTableAction = defineAction({ schema: z.transferSchema, permission: "orders.edit", handler: (c, i) => s.transferTable(c, i.orderId, i.tableId) });
export const payAction = defineAction({ schema: z.paySchema, permission: "payments.collect", handler: (c, i) => s.pay(c, i.orderId, i) });
export const refundAction = defineAction({ schema: z.refundSchema, permission: "payments.refund", handler: (c, i) => s.refundPayment(c, i.paymentId, i) });
export const openShiftAction = defineAction({ schema: z.openShiftSchema, permission: "shifts.manage", handler: (c, i) => s.openShift(c, i) });
export const closeShiftAction = defineAction({ schema: z.closeShiftSchema, permission: "shifts.manage", handler: (c, i) => s.closeShift(c, i) });
export const cashMovementAction = defineAction({ schema: z.cashMoveSchema, permission: "shifts.manage", handler: (c, i) => s.recordCashMovement(c, i) });

import { searchCustomers } from "@/modules/customers/loyalty";
import { zText } from "@/platform/http/zod";
import { z as zod } from "zod";
export const searchCustomersAction = defineAction({ schema: zod.object({ q: zText("Search", 60) }), permission: "orders.edit", write: false, handler: (c, i) => searchCustomers(c, i.q) });
