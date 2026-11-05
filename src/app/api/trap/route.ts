import { getDb } from "@/platform/db";
import { env } from "@/platform/env";
import { clientIpFrom } from "@/platform/security/ip";
import { banIp, recordSecurityEvent } from "@/platform/security/store";
export const dynamic = "force-dynamic";

/**
 * Honeypot URLs. Nothing here exists in this app, so no real user ever requests them; scanners probe for
 * /.env, /wp-login.php, /.git/config, phpMyAdmin and friends (see `rewrites` in next.config.mjs).
 * A hit is logged, the IP is banned from sign-in/registration for 24 h, and the scanner is tarpitted.
 */
async function trap(req: Request) {
  const ip = clientIpFrom((n) => req.headers.get(n), env().TRUSTED_PROXY_HOPS);
  const kind = new URL(req.url).searchParams.get("t") ?? "unknown";
  try {
    const db = await getDb();
    await recordSecurityEvent(db, { type: "trap_url", ip, userAgent: req.headers.get("user-agent"), path: kind, detail: req.method });
    await banIp(db, ip, `Probed trap URL (${kind})`, 86_400);
  } catch { /* never fail loudly */ }
  await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
  return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
}
export { trap as GET, trap as POST, trap as PUT, trap as DELETE, trap as HEAD, trap as PATCH, trap as OPTIONS };
