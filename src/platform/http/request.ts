import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getDb } from "../db";
import { loadContext, type Ctx } from "../auth/context";
import { AuthenticationError } from "../errors";
import { clientMeta, readCookie, SESSION_COOKIE } from "./cookies";
import { can, requireFeature, requirePermission } from "../rbac/guard";
import type { Permission } from "../rbac/permissions";
import type { Feature } from "../tenancy/plans";

/** The signed-in context for this request, or null. Memoised per request. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const token = await readCookie(SESSION_COOKIE());
  if (!token) return null;
  const db = await getDb();
  try {
    const meta = await clientMeta();
    return await loadContext(db, token, { ip: meta.ip });
  } catch (e) {
    if (e instanceof AuthenticationError) return null;
    throw e;
  }
});

export interface PageGuard {
  /** Every listed permission is required. */
  permission?: Permission | Permission[];
  /** Any one of these permissions is enough. */
  anyPermission?: Permission[];
  feature?: Feature;
}

/**
 * Use at the top of every protected server component / layout:
 *   const ctx = await requirePage({ permission: "menu.view", feature: "pos" });
 * Unauthenticated → /login. Blocked workspace → /suspended. Missing permission → 403 page.
 * Missing plan feature → upgrade page.
 */
export async function requirePage(guard: PageGuard = {}, next?: string): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  if (ctx.access.level === "blocked") redirect("/suspended");
  if (!ctx.org.onboardingComplete && can(ctx, "settings.manage")) redirect("/onboarding");
  if (guard.permission) {
    try { requirePermission(ctx, ...(Array.isArray(guard.permission) ? guard.permission : [guard.permission])); }
    catch { redirect("/app/forbidden"); }
  }
  if (guard.anyPermission && !guard.anyPermission.some((p) => ctx.permissions.has(p))) redirect("/app/forbidden");
  if (guard.feature) {
    try { requireFeature(ctx, guard.feature); } catch { redirect(`/app/upgrade?feature=${guard.feature}`); }
  }
  return ctx;
}

export { notFound };
