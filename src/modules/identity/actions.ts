"use server";
import { z } from "zod";
import { defineAction, definePublicAction } from "@/platform/http/action";
import { clearCookie, clientMeta, PLATFORM_COOKIE, readCookie, SESSION_COOKIE, setCookie, TERMINAL_COOKIE } from "@/platform/http/cookies";
import { getCtx } from "@/platform/http/request";
import { getDb } from "@/platform/db";
import { claimTerminalPairing, getTerminalByToken, loginWithPassword, loginWithPin } from "./auth.service";
import { provisionOrganization } from "@/modules/organizations/provision";
import { passwordProblem } from "@/platform/auth/password";
import { enforceRateLimits } from "@/platform/auth/rate-limit";
import { createSession, revokeSession, setActiveBranch } from "@/platform/auth/sessions";
import { ValidationError } from "@/platform/errors";
import { requireBranch } from "@/platform/rbac/guard";

/** Same-site relative paths only: no `//host`, no `/\\host` (browsers treat backslash as slash), no control characters. */
const safeNext = (n: string | undefined, fallback: string) => (n && /^\/(?![/\\])[^\u0000-\u001f\u007f\\]*$/.test(n) ? n : fallback);

export const loginAction = definePublicAction({
  honeypot: true, canaryField: "email", failureEvent: "login_failed",
  schema: z.object({ email: z.string().trim().email("Enter a valid email."), password: z.string().min(1, "Enter your password."), next: z.string().optional() }),
  handler: async (db, input) => {
    const meta = await clientMeta();
    const r = await loginWithPassword(db, { email: input.email, password: input.password, ip: meta.ip, userAgent: meta.userAgent });
    await setCookie(SESSION_COOKIE(), r.token, new Date(r.expiresAt));
    return { redirectTo: r.home === "/suspended" ? r.home : safeNext(input.next, r.home) };
  },
});

export const registerAction = definePublicAction({
  honeypot: true,
  schema: z.object({
    businessName: z.string().trim().min(2, "Enter your restaurant's name.").max(80),
    ownerName: z.string().trim().min(2, "Enter your name.").max(80),
    email: z.string().trim().email("Enter a valid email."),
    password: z.string(),
  }),
  handler: async (db, input) => {
    const meta = await clientMeta();
    await enforceRateLimits(db, [{ key: `register:ip:${meta.ip ?? "unknown"}`, limit: 5, windowSeconds: 3600 }]);
    const problem = passwordProblem(input.password);
    if (problem) throw new ValidationError(undefined, { password: [problem] });
    const { orgId, ownerId, branchId } = await provisionOrganization(db, { businessName: input.businessName, ownerName: input.ownerName, ownerEmail: input.email, ownerPassword: input.password });
    const s = await createSession(db, { orgId, userId: ownerId, branchId, kind: "web", ip: meta.ip, userAgent: meta.userAgent });
    await setCookie(SESSION_COOKIE(), s.token, new Date(s.expiresAt));
    return { redirectTo: "/onboarding" };
  },
});

export const claimPairingAction = definePublicAction({
  schema: z.object({ code: z.string().trim() }),
  handler: async (db, input) => {
    const meta = await clientMeta();
    const r = await claimTerminalPairing(db, { code: input.code, ip: meta.ip });
    await setCookie(TERMINAL_COOKIE(), r.token, new Date(Date.now() + 5 * 365 * 86_400_000));
    return { redirectTo: "/pin" };
  },
});

export const pinLoginAction = definePublicAction({
  schema: z.object({ userId: z.string().min(1), pin: z.string() }),
  handler: async (db, input) => {
    const token = await readCookie(TERMINAL_COOKIE());
    if (!token) throw new ValidationError("This device isn't paired yet.");
    const meta = await clientMeta();
    const r = await loginWithPin(db, { terminalToken: token, userId: input.userId, pin: input.pin, ip: meta.ip, userAgent: meta.userAgent });
    await setCookie(SESSION_COOKIE(), r.token, new Date(r.expiresAt));
    return { redirectTo: r.home };
  },
});

export async function logoutAction(): Promise<{ ok: true; data: null }> {
  const ctx = await getCtx();
  if (ctx) await revokeSession(await getDb(), ctx.sessionId);
  await clearCookie(SESSION_COOKIE());
  return { ok: true, data: null };
}

export const switchBranchAction = defineAction({
  schema: z.object({ branchId: z.string() }),
  write: false,
  handler: async (ctx, input) => {
    requireBranch(ctx, input.branchId);
    await setActiveBranch(ctx.db, ctx.sessionId, input.branchId);
    return null;
  },
});

/** Used by the shell: takes a plain id. */
export async function switchBranchById(branchId: string) {
  return switchBranchAction({ branchId });
}

export { PLATFORM_COOKIE };
