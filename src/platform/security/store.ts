import type { Db, Doc } from "../db";
import { newId } from "../ids";

/**
 * Security telemetry and temporary IP bans, kept in the database so every instance sees the same state.
 * Honest scope: this protects the application layer. Network-level floods (DDoS) belong to your CDN / WAF / load balancer.
 */
export type SecurityEventType =
  | "honeypot_form" | "form_too_fast" | "trap_url" | "canary_login" | "login_failed" | "rate_limited" | "bad_signature" | "banned_request" | "totp_failed" | "console_ip_blocked" | "ban" | "unban";

export type SecurityEvent = Doc & { type: SecurityEventType; ip: string | null; userAgent: string | null; path: string | null; detail: string | null; createdAt: string };
type Ban = Doc & { until: string; reason: string; source: string; createdAt: string };

export async function recordSecurityEvent(db: Db, e: { type: SecurityEventType; ip: string | null; userAgent?: string | null; path?: string | null; detail?: string | null }): Promise<void> {
  try {
    await db.col("securityEvents").insert({ id: newId("audit"), type: e.type, ip: e.ip, userAgent: e.userAgent?.slice(0, 200) ?? null, path: e.path?.slice(0, 200) ?? null, detail: e.detail?.slice(0, 300) ?? null, createdAt: new Date().toISOString() });
  } catch { /* telemetry must never break a request */ }
}

const cache = new Map<string, { banned: boolean; at: number }>();
export const __resetSecurityCache = () => cache.clear();
const CACHE_MS = 10_000;

export async function isBanned(db: Db, ip: string | null, now: Date = new Date()): Promise<boolean> {
  if (!ip) return false;
  const hit = cache.get(ip);
  if (hit && now.getTime() - hit.at < CACHE_MS) return hit.banned;
  const b = await db.col<Ban>("securityBans").findOne({ id: ip });
  const banned = !!b && Date.parse(b.until) > now.getTime();
  cache.set(ip, { banned, at: now.getTime() });
  return banned;
}

export async function banIp(db: Db, ip: string | null, reason: string, ttlSeconds: number, source = "auto", now: Date = new Date()): Promise<void> {
  if (!ip) return;
  const until = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const col = db.col<Ban>("securityBans");
  const existing = await col.findOne({ id: ip });
  if (existing) await col.update({ id: ip }, { $set: { until: existing.until > until ? existing.until : until, reason, source } });
  else await col.insert({ id: ip, until, reason, source, createdAt: now.toISOString() });
  cache.delete(ip);
  await recordSecurityEvent(db, { type: "ban", ip, detail: `${reason} (${Math.round(ttlSeconds / 60)} min, ${source})` });
}

export async function unbanIp(db: Db, ip: string): Promise<void> {
  await db.col("securityBans").delete({ id: ip });
  cache.delete(ip);
  await recordSecurityEvent(db, { type: "unban", ip, detail: "lifted by operator" });
}

/** Ban when the same IP produced `threshold` events of `type` inside the window. */
export async function maybeAutoBan(db: Db, ip: string | null, type: SecurityEventType, o: { threshold: number; windowSeconds: number; banSeconds: number }, now: Date = new Date()): Promise<boolean> {
  if (!ip) return false;
  const since = new Date(now.getTime() - o.windowSeconds * 1000).toISOString();
  const n = await db.col("securityEvents").count({ ip, type, createdAt: { $gte: since } });
  if (n < o.threshold) return false;
  await banIp(db, ip, `${n}× ${type} in ${Math.round(o.windowSeconds / 60)} min`, o.banSeconds, "auto", now);
  return true;
}

export async function listSecurity(db: Db, limit = 100): Promise<{ events: SecurityEvent[]; bans: (Ban & { active: boolean })[] }> {
  const [events, bans] = await Promise.all([
    db.col<SecurityEvent>("securityEvents").find({}, { sort: { createdAt: -1, id: -1 }, limit }),
    db.col<Ban>("securityBans").find({}, { sort: { createdAt: -1 }, limit: 200 }),
  ]);
  const now = Date.now();
  return { events, bans: bans.map((b) => ({ ...b, active: Date.parse(b.until) > now })) };
}

/** Email local-parts nobody legitimately signs in with here; attackers and credential-stuffing tools love them. */
const CANARY_LOCALS = new Set(["admin", "administrator", "root", "test", "user", "info", "support", "webmaster", "postmaster", "sysadmin", "demo1", "superadmin"]);
export const isCanaryEmail = (email: string): boolean => CANARY_LOCALS.has((email.split("@")[0] ?? "").trim().toLowerCase());
