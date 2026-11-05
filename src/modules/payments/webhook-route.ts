import { getDb } from "@/platform/db";
import { env } from "@/platform/env";
import { enforceRateLimits } from "@/platform/auth/rate-limit";
import { RateLimitError } from "@/platform/errors";
import { clientIpFrom } from "@/platform/security/ip";
import { maybeAutoBan, recordSecurityEvent } from "@/platform/security/store";
import { handlePaystackWebhook } from "./service";

const MAX_BODY = 256 * 1024; // real Paystack events are a few KB

/**
 * Shared by both webhook endpoints. Order matters: cheap checks first (size, rate), signature before any parsing or DB work
 * on the payload. Bad signatures are logged and repeated offenders are banned from sign-in. Paystack's own retries are never
 * blocked: a valid signature is always processed, and the rate limit is generous.
 */
export async function webhookResponse(req: Request, orgId: string | null): Promise<Response> {
  const ip = clientIpFrom((n) => req.headers.get(n), env().TRUSTED_PROXY_HOPS);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return new Response("payload too large", { status: 413 });
  try {
    const db = await getDb();
    await enforceRateLimits(db, [{ key: `webhook:${orgId ?? "platform"}:${ip ?? "unknown"}`, limit: 300, windowSeconds: 60 }]);
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY) return new Response("payload too large", { status: 413 });
    const ok = await handlePaystackWebhook(db, { orgId, rawBody, signature: req.headers.get("x-paystack-signature") });
    if (ok) return new Response("ok");
    await recordSecurityEvent(db, { type: "bad_signature", ip, userAgent: req.headers.get("user-agent"), path: orgId ? `webhook:${orgId}` : "webhook:platform" });
    await maybeAutoBan(db, ip, "bad_signature", { threshold: 10, windowSeconds: 600, banSeconds: 3600 });
    return new Response("invalid signature", { status: 401 });
  } catch (e) {
    if (e instanceof RateLimitError) return new Response("slow down", { status: 429, headers: { "retry-after": String(e.retryAfterSeconds ?? 60) } });
    console.error("[paystack webhook]", e);
    return new Response("error", { status: 500 });
  }
}
