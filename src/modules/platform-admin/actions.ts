"use server";

import { definePlatformAction } from "./action";
import { definePublicAction } from "@/platform/http/action";
import { clearCookie, clientMeta, PLATFORM_COOKIE, setCookie } from "@/platform/http/cookies";
import { beginTwoFactor, confirmTwoFactor, disableTwoFactor, loginPlatformAdmin, revokePlatformSession } from "./auth";
import { banIp, unbanIp } from "@/platform/security/store";
import { getPlatformCtx } from "./request";
import { getDb } from "@/platform/db";
import * as s from "./service";
import * as v from "./schema";
import * as pay from "@/modules/payments/service";
import * as payv from "@/modules/payments/schema";

export const platformLoginAction = definePublicAction({
  honeypot: true, canaryField: "email", failureEvent: "login_failed",
  schema: v.loginSchema,
  handler: async (db, i) => {
    const meta = await clientMeta();
    const r = await loginPlatformAdmin(db, { ...i, ip: meta.ip, userAgent: meta.userAgent });
    await setCookie(PLATFORM_COOKIE(), r.token, new Date(r.expiresAt));
    return { redirectTo: "/platform" };
  },
});
export async function platformLogoutAction() {
  const ctx = await getPlatformCtx();
  if (ctx) await revokePlatformSession(await getDb(), ctx.sessionId);
  await clearCookie(PLATFORM_COOKIE());
  return { ok: true as const, data: null };
}
export const suspendOrgAction = definePlatformAction({ schema: v.suspendSchema, handler: async (c, i) => { await s.suspendOrg(c, i.id, i.reason); return null; } });
export const reactivateOrgAction = definePlatformAction({ schema: v.idSchema, handler: async (c, i) => { await s.reactivateOrg(c, i.id); return null; } });
export const changePlanAction = definePlatformAction({ schema: v.changePlanSchema, handler: async (c, i) => { await s.changePlan(c, i.id, i.planCode); return null; } });
export const extendTrialAction = definePlatformAction({ schema: v.extendTrialSchema, handler: async (c, i) => { await s.extendTrial(c, i.id, i.days); return null; } });
export const recordPaymentAction = definePlatformAction({ schema: v.paymentSchema, handler: async (c, i) => { await s.recordPayment(c, i); return null; } });
export const approveRequestAction = definePlatformAction({ schema: v.idSchema, handler: async (c, i) => { await s.reviewRequest(c, i.id, true); return null; } });
export const rejectRequestAction = definePlatformAction({ schema: v.rejectRequestSchema, handler: async (c, i) => { await s.reviewRequest(c, i.id, false, i.reason); return null; } });
export const savePlanAction = definePlatformAction({ schema: v.planSchema, handler: async (c, i) => { await s.savePlanDef(c, i); return null; } });
export const saveGatewayAction = definePlatformAction({ schema: payv.gatewaySchema, handler: (c, i) => pay.saveGateway(c, i.orgId, i) });
export const removeGatewayAction = definePlatformAction({ schema: payv.orgOnlySchema, handler: async (c, i) => { await pay.removeGateway(c, i.orgId); return null; } });
export const testGatewayAction = definePlatformAction({ schema: payv.orgOnlySchema, handler: (c, i) => pay.testGateway(c, i.orgId) });
export const beginTwoFactorAction = definePlatformAction({ schema: v.emptyOk, handler: (c) => beginTwoFactor(c.db, c.adminId) });
export const confirmTwoFactorAction = definePlatformAction({ schema: v.totpConfirmSchema, handler: (c, i) => confirmTwoFactor(c.db, c.adminId, i.code) });
export const disableTwoFactorAction = definePlatformAction({ schema: v.totpDisableSchema, handler: async (c, i) => { await disableTwoFactor(c.db, c.adminId, i); return null; } });
export const unbanIpAction = definePlatformAction({ schema: v.unbanSchema, handler: async (c, i) => { await unbanIp(c.db, i.ip); return null; } });
export const banIpAction = definePlatformAction({ schema: v.banSchema, handler: async (c, i) => { await banIp(c.db, i.ip, `Banned by ${c.name}`, i.hours * 3600, "operator"); return null; } });
