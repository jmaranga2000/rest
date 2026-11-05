import { randomInt } from "node:crypto";
import type { Db, Doc } from "@/platform/db";
import { hashSecret, verifySecret, PIN_PATTERN } from "@/platform/auth/password";
import { enforceRateLimits, resetRateLimit } from "@/platform/auth/rate-limit";
import { createSession } from "@/platform/auth/sessions";
import { hashToken, newToken } from "@/platform/auth/tokens";
import { AuthenticationError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { getSystemRole } from "@/platform/rbac/roles";

export interface LoginResult { token: string; expiresAt: string; home: string; mustChangePassword: boolean }

interface LoginRow {
  id: string; orgId: string; passwordHash: string | null; status: string; mustChangePassword: boolean;
  roleKey: string; orgStatus: string;
}

/** Home screen by role key; custom roles go to the app dashboard. */
export function homeForRole(roleKey: string): string {
  return getSystemRole(roleKey)?.home ?? "/app";
}

/**
 * Email + password sign-in. Rate limited per IP and per email, constant-time
 * password check even for unknown emails, and one generic error message so the
 * response never reveals whether an account exists.
 */
export async function loginWithPassword(db: Db, input: { email: string; password: string; ip?: string | null; userAgent?: string | null; now?: Date }): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  await enforceRateLimits(db, [
    { key: `login:email:${email}`, limit: 8, windowSeconds: 15 * 60 },
    { key: `login:ip:${input.ip ?? "unknown"}`, limit: 40, windowSeconds: 15 * 60 },
  ], input.now);

  const u = await db.col<{ id: string; orgId: string; passwordHash: string | null; status: string; mustChangePassword: boolean; roleId: string }>("users").findOne({ emailLower: email });
  const [role, org] = u ? await Promise.all([db.col<Doc & { key: string }>("roles").findOne({ id: u.roleId, orgId: u.orgId }), db.col<Doc & { status: string }>("organizations").findOne({ id: u.orgId })]) : [null, null];
  const user: LoginRow | null = u && role && org ? { id: u.id, orgId: u.orgId, passwordHash: u.passwordHash, status: u.status, mustChangePassword: Boolean(u.mustChangePassword), roleKey: role.key, orgStatus: org.status } : null;
  const ok = await verifySecret(input.password, user?.passwordHash);
  if (!user || !ok || user.status !== "active") throw new AuthenticationError("Incorrect email or password.");

  await resetRateLimit(db, `login:email:${email}`);
  const session = await createSession(db, { orgId: user.orgId, userId: user.id, kind: "web", ip: input.ip, userAgent: input.userAgent, now: input.now });
  return { token: session.token, expiresAt: session.expiresAt, home: user.orgStatus === "active" ? homeForRole(user.roleKey) : "/suspended", mustChangePassword: user.mustChangePassword };
}

// ---------------------------------------------------------------------------
// Terminals & PIN sign-in (shared POS / kitchen devices)
// ---------------------------------------------------------------------------

const PAIRING_TTL_MS = 15 * 60_000;

/** A manager generates a short one-time code and types it on the new device. */
export async function createTerminalPairing(db: Db, input: { orgId: string; branchId: string; name: string; kind: "pos" | "kds"; now?: Date }): Promise<{ terminalId: string; code: string; expiresAt: string }> {
  const now = input.now ?? new Date();
  const code = String(randomInt(100000, 1000000));
  const id = newId("terminal");
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS).toISOString();
  await db.col("terminals").insert({
    id, orgId: input.orgId, branchId: input.branchId, name: input.name, kind: input.kind, isActive: true, tokenHash: null,
    pairingHash: hashToken(`pair:${code}`), pairingExpiresAt: expiresAt, pairedAt: null, lastSeenAt: null, createdAt: now.toISOString(),
  });
  return { terminalId: id, code, expiresAt };
}

/** Called from the device being paired. Returns the long-lived device token. */
export async function claimTerminalPairing(db: Db, input: { code: string; ip?: string | null; now?: Date }): Promise<{ token: string; terminalId: string; kind: "pos" | "kds" }> {
  const now = input.now ?? new Date();
  await enforceRateLimits(db, [{ key: `pair:ip:${input.ip ?? "unknown"}`, limit: 10, windowSeconds: 15 * 60 }], now);
  if (!/^\d{6}$/.test(input.code)) throw new ValidationError("Enter the 6-digit pairing code.");
  const t = await db.col<{ id: string; kind: "pos" | "kds" }>("terminals").findOne({ pairingHash: hashToken(`pair:${input.code}`), isActive: true, tokenHash: null, pairingExpiresAt: { $gt: now.toISOString() } });
  if (!t) throw new AuthenticationError("That pairing code is invalid or has expired.");
  const { token, hash } = newToken();
  await db.col("terminals").update({ id: t.id }, { $set: { tokenHash: hash, pairingHash: null, pairingExpiresAt: null, pairedAt: now.toISOString(), lastSeenAt: now.toISOString() } });
  return { token, terminalId: t.id, kind: t.kind };
}

export interface TerminalInfo { id: string; orgId: string; branchId: string; name: string; kind: "pos" | "kds"; orgName: string; branchName: string }

export async function getTerminalByToken(db: Db, token: string): Promise<TerminalInfo | null> {
  const t = await db.col<{ id: string; orgId: string; branchId: string; name: string; kind: "pos" | "kds" }>("terminals").findOne({ tokenHash: hashToken(token), isActive: true });
  if (!t) return null;
  const [o, b] = await Promise.all([db.col<Doc & { name: string; status: string }>("organizations").findOne({ id: t.orgId }), db.col<Doc & { name: string }>("branches").findOne({ id: t.branchId, orgId: t.orgId })]);
  if (!o || o.status !== "active" || !b) return null;
  return { id: t.id, orgId: t.orgId, branchId: t.branchId, name: t.name, kind: t.kind, orgName: o.name, branchName: b.name };
}

/** Staff shown on a paired terminal's PIN screen: active users with a PIN assigned to that branch. */
export async function listPinUsers(db: Db, terminal: TerminalInfo): Promise<{ id: string; name: string; color: string; roleName: string }[]> {
  const users = await db.col<{ id: string; name: string; color: string; roleId: string; branchIds: string[] }>("users").find({ orgId: terminal.orgId, status: "active", pinHash: { $type: "string" } }, { sort: { name: 1 } });
  const roles = new Map((await db.col<{ id: string; name: string; allBranches: boolean }>("roles").find({ orgId: terminal.orgId })).map((r) => [r.id, r]));
  return users.flatMap((u) => {
    const r = roles.get(u.roleId);
    if (!r || !(r.allBranches || (u.branchIds ?? []).includes(terminal.branchId))) return [];
    return [{ id: u.id, name: u.name, color: u.color, roleName: r.name }];
  });
}

export async function loginWithPin(db: Db, input: { terminalToken: string; userId: string; pin: string; ip?: string | null; userAgent?: string | null; now?: Date }): Promise<LoginResult> {
  const terminal = await getTerminalByToken(db, input.terminalToken);
  if (!terminal) throw new AuthenticationError("This device isn't paired. Pair it from Settings → Terminals.");
  if (!PIN_PATTERN.test(input.pin)) throw new ValidationError("Enter your 4–6 digit PIN.");
  await enforceRateLimits(db, [
    { key: `pin:${terminal.id}:${input.userId}`, limit: 5, windowSeconds: 10 * 60 },
    { key: `pin:terminal:${terminal.id}`, limit: 40, windowSeconds: 10 * 60 },
  ], input.now);

  const pu = await db.col<{ id: string; pinHash: string | null; status: string; roleId: string }>("users").findOne({ orgId: terminal.orgId, id: input.userId });
  const prole = pu ? await db.col<Doc & { key: string }>("roles").findOne({ id: pu.roleId, orgId: terminal.orgId }) : null;
  const user = pu && prole ? { id: pu.id, pinHash: pu.pinHash, status: pu.status, roleKey: prole.key } : null;
  const ok = await verifySecret(input.pin, user?.pinHash);
  if (!user || !ok || user.status !== "active") throw new AuthenticationError("Incorrect PIN.");
  await resetRateLimit(db, `pin:${terminal.id}:${input.userId}`);

  const session = await createSession(db, { orgId: terminal.orgId, userId: user.id, branchId: terminal.branchId, terminalId: terminal.id, kind: "pin", ip: input.ip, userAgent: input.userAgent, now: input.now });
  await db.col("terminals").update({ id: terminal.id }, { $set: { lastSeenAt: (input.now ?? new Date()).toISOString() } });
  return { token: session.token, expiresAt: session.expiresAt, home: terminal.kind === "kds" ? "/kitchen" : homeForRole(user.roleKey) === "/kitchen" ? "/kitchen" : "/pos", mustChangePassword: false };
}

export async function setUserPin(db: Db, orgId: string, userId: string, pin: string): Promise<void> {
  if (!PIN_PATTERN.test(pin)) throw new ValidationError("A PIN must be 4–6 digits.");
  const changed = await db.col("users").update({ orgId, id: userId }, { $set: { pinHash: await hashSecret(pin), updatedAt: new Date().toISOString() } });
  if (!changed) throw new NotFoundError("User");
}
