import { cache } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/platform/db";
import { AuthenticationError } from "@/platform/errors";
import { clientMeta, PLATFORM_COOKIE, readCookie } from "@/platform/http/cookies";
import { loadPlatformCtx, type PlatformCtx } from "./auth";

/** The operator for this request, or null. Memoised per request. Reads ONLY the platform cookie. */
export const getPlatformCtx = cache(async (): Promise<PlatformCtx | null> => {
  const token = await readCookie(PLATFORM_COOKIE());
  if (!token) return null;
  try {
    const meta = await clientMeta();
    return await loadPlatformCtx(await getDb(), token, { ip: meta.ip });
  } catch (e) {
    if (e instanceof AuthenticationError) return null;
    throw e;
  }
});

export async function requirePlatformPage(): Promise<PlatformCtx> {
  const ctx = await getPlatformCtx();
  if (!ctx) redirect("/platform/login");
  return ctx;
}
