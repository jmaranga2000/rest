import type { Db } from "../db";
import { RateLimitError } from "../errors";

export interface RateLimitRule {
  key: string;
  limit: number;
  windowSeconds: number;
}

interface LimitDoc { id: string; windowStart: string; hits: number }

/**
 * Fixed-window limiter stored in the database, so it is correct across
 * serverless instances without needing Redis. Must be called with the ROOT db
 * handle (not a transaction) so failed attempts persist even if the caller rolls back.
 */
export async function consumeRateLimit(db: Db, rule: RateLimitRule, now: Date = new Date()): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - rule.windowSeconds * 1000).toISOString();
  const col = db.col<LimitDoc>("rateLimits");
  // 1) window expired → reset to a fresh window (atomic: only one writer wins the reset)
  let row = await col.findOneAndUpdate({ id: rule.key, windowStart: { $lt: cutoff } }, { $set: { windowStart: nowIso, hits: 1 } });
  // 2) otherwise count a hit in the current window (creating the window if this is the first attempt)
  if (!row) {
    try { row = await col.findOneAndUpdate({ id: rule.key }, { $inc: { hits: 1 }, $setOnInsert: { windowStart: nowIso } }, { upsert: true }); }
    catch { row = await col.findOneAndUpdate({ id: rule.key }, { $inc: { hits: 1 } }); } // lost an insert race
  }
  const hits = Number(row?.hits ?? 1);
  const started = new Date(row?.windowStart ?? nowIso).getTime();
  const retryAfterSeconds = Math.max(1, Math.ceil((started + rule.windowSeconds * 1000 - now.getTime()) / 1000));
  return { allowed: hits <= rule.limit, remaining: Math.max(0, rule.limit - hits), retryAfterSeconds };
}

/** Throws RateLimitError if any rule is exhausted. All rules are always consumed. */
export async function enforceRateLimits(db: Db, rules: RateLimitRule[], now?: Date): Promise<void> {
  let worst = 0;
  for (const rule of rules) {
    const r = await consumeRateLimit(db, rule, now);
    if (!r.allowed) worst = Math.max(worst, r.retryAfterSeconds);
  }
  if (worst > 0) throw new RateLimitError(worst);
}

export async function resetRateLimit(db: Db, key: string): Promise<void> {
  await db.col("rateLimits").delete({ id: key });
}

/** Opportunistic cleanup, safe to call from any maintenance path. */
export async function purgeRateLimits(db: Db, olderThanSeconds = 86_400, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanSeconds * 1000).toISOString();
  return db.col("rateLimits").delete({ windowStart: { $lt: cutoff } });
}
