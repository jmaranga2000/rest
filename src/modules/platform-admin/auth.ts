import type { Db } from "@/platform/db";
import type { Doc } from "@/platform/db";
import { decryptSecret, encryptSecret } from "@/platform/crypto";
import { newTotpSecret, otpauthUri, verifyTotp } from "@/platform/security/totp";
import { recordSecurityEvent } from "@/platform/security/store";
import { hashSecret, passwordProblem, verifySecret } from "@/platform/auth/password";
import { enforceRateLimits, resetRateLimit } from "@/platform/auth/rate-limit";
import { hashToken, newToken } from "@/platform/auth/tokens";
import { AuthenticationError, ConflictError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";

type AdminDoc = Doc & { passwordHash: string; isActive: boolean; email: string; totpEnabled?: boolean; totpSecretEnc?: string | null; totpPendingEnc?: string | null; totpLastStep?: number; recoveryHashes?: string[] };

export const PLATFORM_SESSION_TTL_MS = 8 * 3600_000;

/** Who is acting in the operator console. Entirely separate from the tenant `Ctx`. */
export interface PlatformCtx {
  db: Db;
  sessionId: string;
  adminId: string;
  name: string;
  email: string;
  ip: string | null;
}

export async function loginPlatformAdmin(db: Db, input: { email: string; password: string; code?: string | null; ip?: string | null; userAgent?: string | null; now?: Date }): Promise<{ token: string; expiresAt: string }> {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  await enforceRateLimits(db, [
    { key: `platform-login:email:${email}`, limit: 5, windowSeconds: 15 * 60 },
    { key: `platform-login:ip:${input.ip ?? "unknown"}`, limit: 30, windowSeconds: 15 * 60 },
  ], now);
  const admin = await db.col<AdminDoc>("platformAdmins").findOne({ emailLower: email });
  const ok = await verifySecret(input.password, admin?.passwordHash);
  if (!admin || !ok || !admin.isActive) throw new AuthenticationError("Incorrect email or password.");
  if (admin.totpEnabled) {
    // Second factor. Only reachable with the right password; wrong codes burn the same rate-limit budget as wrong passwords.
    const code = (input.code ?? "").trim();
    if (!code) throw new ValidationError("Enter the 6-digit code from your authenticator app.", { code: ["Enter the 6-digit code from your authenticator app."] });
    if (!(await consumeSecondFactor(db, admin, code, now))) {
      await recordSecurityEvent(db, { type: "totp_failed", ip: input.ip ?? null, userAgent: input.userAgent ?? null, detail: email });
      throw new AuthenticationError("That code is not valid.");
    }
  }
  await resetRateLimit(db, `platform-login:email:${email}`);
  const { token, hash } = newToken();
  const expiresAt = new Date(now.getTime() + PLATFORM_SESSION_TTL_MS).toISOString();
  await db.col("platformSessions").insert({
    id: newId("session"), adminId: admin.id, tokenHash: hash, ip: input.ip ?? null, userAgent: input.userAgent?.slice(0, 300) ?? null,
    expiresAt, lastSeenAt: now.toISOString(), revokedAt: null, createdAt: now.toISOString(),
  });
  await db.col("platformAdmins").update({ id: admin.id }, { $set: { lastLoginAt: now.toISOString() } });
  return { token, expiresAt };
}

export async function loadPlatformCtx(db: Db, token: string, meta: { ip?: string | null; now?: Date } = {}): Promise<PlatformCtx> {
  const nowIso = (meta.now ?? new Date()).toISOString();
  const sess = await db.col<Doc & { adminId: string }>("platformSessions").findOne({ tokenHash: hashToken(token), revokedAt: null, expiresAt: { $gt: nowIso } });
  const adm = sess ? await db.col<Doc & { name: string; email: string }>("platformAdmins").findOne({ id: sess.adminId, isActive: true }) : null;
  if (!sess || !adm) throw new AuthenticationError();
  const row = { sessionId: sess.id, adminId: adm.id, name: adm.name, email: adm.email };
  return { db, sessionId: row.sessionId, adminId: row.adminId, name: row.name, email: row.email, ip: meta.ip ?? null };
}

export async function revokePlatformSession(db: Db, sessionId: string): Promise<void> {
  await db.col("platformSessions").update({ id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date().toISOString() } });
}

/** Only path that creates operators: the CLI script and the (authenticated) Admins screen. */
export async function createPlatformAdmin(db: Db, input: { name: string; email: string; password: string }): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ValidationError("Enter a valid email.", { email: ["Enter a valid email."] });
  const problem = passwordProblem(input.password);
  if (problem) throw new ValidationError(problem, { password: [problem] });
  if (await db.col("platformAdmins").findOne({ emailLower: email })) throw new ConflictError("An admin with that email already exists.");
  const id = newId("admin");
  await db.col("platformAdmins").insert({ id, email, emailLower: email, name: input.name.trim(), passwordHash: await hashSecret(input.password), createdAt: new Date().toISOString() });
  return { id };
}

export async function platformAudit(ctx: Pick<PlatformCtx, "db" | "adminId" | "name">, e: { action: string; summary: string; orgId?: string | null; data?: Record<string, unknown> }): Promise<void> {
  await ctx.db.col("platformAuditLogs").insert({
    id: newId("audit"), adminId: ctx.adminId, adminName: ctx.name, orgId: e.orgId ?? null, action: e.action, summary: e.summary,
    data: e.data ?? null, createdAt: new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------ two-factor (TOTP) for operators */
async function consumeSecondFactor(db: Db, admin: AdminDoc, code: string, now: Date): Promise<boolean> {
  if (admin.totpSecretEnc) {
    const step = verifyTotp(decryptSecret(admin.totpSecretEnc), code, now, admin.totpLastStep ?? -1);
    if (step !== null) { await db.col("platformAdmins").update({ id: admin.id }, { $set: { totpLastStep: step } }); return true; } // a code can never be replayed
  }
  const h = hashToken(code.replace(/[\s-]/g, "").toLowerCase());
  if (admin.recoveryHashes?.includes(h)) { await db.col("platformAdmins").update({ id: admin.id }, { $set: { recoveryHashes: admin.recoveryHashes.filter((x) => x !== h) } }); return true; } // single-use
  return false;
}

export async function twoFactorStatus(db: Db, adminId: string): Promise<{ enabled: boolean; recoveryLeft: number }> {
  const a = await db.col<AdminDoc>("platformAdmins").findOne({ id: adminId });
  return { enabled: !!a?.totpEnabled, recoveryLeft: a?.recoveryHashes?.length ?? 0 };
}

export async function beginTwoFactor(db: Db, adminId: string): Promise<{ secret: string; uri: string }> {
  const a = await db.col<AdminDoc>("platformAdmins").findOne({ id: adminId });
  if (!a) throw new AuthenticationError();
  if (a.totpEnabled) throw new ConflictError("Two-factor sign-in is already on. Turn it off first to re-enrol.");
  const secret = newTotpSecret();
  await db.col("platformAdmins").update({ id: adminId }, { $set: { totpPendingEnc: encryptSecret(secret) } });
  return { secret, uri: otpauthUri(secret, a.email) };
}

/** Confirms enrolment with a first code, switches 2FA on, and returns one-time recovery codes (shown once). */
export async function confirmTwoFactor(db: Db, adminId: string, code: string, now: Date = new Date()): Promise<{ recoveryCodes: string[] }> {
  const a = await db.col<AdminDoc>("platformAdmins").findOne({ id: adminId });
  if (!a?.totpPendingEnc) throw new ValidationError("Start setup again.", { code: ["Start setup again."] });
  const step = verifyTotp(decryptSecret(a.totpPendingEnc), code, now);
  if (step === null) throw new ValidationError("That code is not valid. Check the time on your phone.", { code: ["That code is not valid. Check the time on your phone."] });
  const codes = Array.from({ length: 8 }, () => { const r = newToken().token.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 10); return `${r.slice(0, 5)}-${r.slice(5)}`; });
  await db.col("platformAdmins").update({ id: adminId }, { $set: { totpEnabled: true, totpSecretEnc: a.totpPendingEnc, totpPendingEnc: null, totpLastStep: step, recoveryHashes: codes.map((c) => hashToken(c.replace("-", ""))) } });
  await db.col("platformSessions").update({ adminId, revokedAt: null }, { $set: { revokedAt: now.toISOString() } }); // sign every device in again with the second factor
  return { recoveryCodes: codes };
}

export async function disableTwoFactor(db: Db, adminId: string, input: { password: string; code: string }, now: Date = new Date()): Promise<void> {
  const a = await db.col<AdminDoc>("platformAdmins").findOne({ id: adminId });
  if (!a?.totpEnabled) return;
  if (!(await verifySecret(input.password, a.passwordHash)) || !(await consumeSecondFactor(db, a, input.code.trim(), now))) throw new AuthenticationError("Password or code is not valid.");
  await db.col("platformAdmins").update({ id: adminId }, { $set: { totpEnabled: false, totpSecretEnc: null, totpPendingEnc: null, recoveryHashes: [] } });
}
