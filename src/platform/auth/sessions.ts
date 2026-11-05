import type { Db } from "../db";
import { newId } from "../ids";
import { newToken } from "./tokens";

export const WEB_SESSION_TTL_MS = 14 * 24 * 3600_000;
export const PIN_SESSION_TTL_MS = 12 * 3600_000;

export interface NewSession {
  orgId: string;
  userId: string;
  branchId?: string | null;
  terminalId?: string | null;
  kind: "web" | "pin";
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
}

export async function createSession(db: Db, input: NewSession): Promise<{ token: string; id: string; expiresAt: string }> {
  const now = input.now ?? new Date();
  const { token, hash } = newToken();
  const id = newId("session");
  const expiresAt = new Date(now.getTime() + (input.kind === "pin" ? PIN_SESSION_TTL_MS : WEB_SESSION_TTL_MS)).toISOString();
  await db.col("sessions").insert({
    id, orgId: input.orgId, userId: input.userId, branchId: input.branchId ?? null, terminalId: input.terminalId ?? null,
    tokenHash: hash, kind: input.kind, ip: input.ip ?? null, userAgent: input.userAgent?.slice(0, 300) ?? null,
    expiresAt, lastSeenAt: now.toISOString(), revokedAt: null, createdAt: now.toISOString(),
  });
  await db.col("users").update({ id: input.userId }, { $set: { lastLoginAt: now.toISOString() } });
  return { token, id, expiresAt };
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.col("sessions").update({ id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date().toISOString() } });
}

/** Sign a user out everywhere (password reset, deactivation, role downgrade). */
export async function revokeAllSessions(db: Db, userId: string, exceptSessionId?: string): Promise<void> {
  await db.col("sessions").update({ userId, revokedAt: null, ...(exceptSessionId ? { id: { $ne: exceptSessionId } } : {}) }, { $set: { revokedAt: new Date().toISOString() } });
}

export async function setActiveBranch(db: Db, sessionId: string, branchId: string): Promise<void> {
  await db.col("sessions").update({ id: sessionId }, { $set: { branchId } });
}

export async function purgeExpiredSessions(db: Db, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  return db.col("sessions").delete({ $or: [{ expiresAt: { $lt: cutoff } }, { revokedAt: { $lt: cutoff } }] });
}
