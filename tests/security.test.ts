import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createTestDb } from "./helpers";
import { clientIpFrom, ipAllowed } from "@/platform/security/ip";
import { checkHoneypot, MIN_FILL_MS } from "@/platform/security/honeypot";
import { __resetSecurityCache, banIp, isBanned, isCanaryEmail, listSecurity, maybeAutoBan, recordSecurityEvent, unbanIp } from "@/platform/security/store";
import { base32Decode, base32Encode, newTotpSecret, otpauthUri, totpAt, verifyTotp } from "@/platform/security/totp";
import { beginTwoFactor, confirmTwoFactor, createPlatformAdmin, disableTwoFactor, loginPlatformAdmin, twoFactorStatus } from "@/modules/platform-admin/auth";
import { assertSafeDocument } from "@/platform/store/filter";
import { __resetEnvForTests, __setEnvForTests, env } from "@/platform/env";
import { webhookResponse } from "@/modules/payments/webhook-route";

beforeEach(() => { __resetSecurityCache(); __setEnvForTests({}); });

test("client IP is read from the proxy-controlled right side of X-Forwarded-For", () => {
  const h = (xff: string, real?: string) => (n: string) => ({ "x-forwarded-for": xff, "x-real-ip": real }[n] ?? null);
  assert.equal(clientIpFrom(h("6.6.6.6, 203.0.113.9"), 1), "203.0.113.9", "client-supplied left entry is ignored");
  assert.equal(clientIpFrom(h("6.6.6.6, 203.0.113.9, 10.0.0.2"), 2), "203.0.113.9");
  assert.equal(clientIpFrom(h("203.0.113.9"), 1), "203.0.113.9");
  assert.equal(clientIpFrom(h("6.6.6.6", "198.51.100.4"), 0), "198.51.100.4", "0 hops: header ignored entirely");
  assert.equal(clientIpFrom(h(""), 1), null);
});

test("operator console allow-list supports exact IPs and CIDR", () => {
  const list = "203.0.113.7, 10.0.0.0/8 ,192.168.1.0/24";
  assert.ok(ipAllowed("203.0.113.7", list)); assert.ok(ipAllowed("10.200.3.4", list)); assert.ok(ipAllowed("192.168.1.99", list));
  assert.ok(!ipAllowed("192.168.2.1", list)); assert.ok(!ipAllowed("203.0.113.8", list)); assert.ok(!ipAllowed(null, list)); assert.ok(!ipAllowed("evil", list));
});

test("honeypot: filled field, missing timestamp and instant submissions are all flagged", () => {
  const now = 1_000_000_000_000;
  assert.equal(checkHoneypot({ _hp: "", _t: String(now - MIN_FILL_MS - 500) }, now), "ok");
  assert.equal(checkHoneypot({ _hp: "http://spam", _t: String(now - 5000) }, now), "filled");
  assert.equal(checkHoneypot({ _hp: "", _t: String(now - 200) }, now), "too_fast");
  assert.equal(checkHoneypot({ _hp: "" }, now), "missing");
  assert.equal(checkHoneypot({ _hp: "", _t: String(now + 99999) }, now), "missing", "timestamps from the future");
  const fd = new FormData(); fd.set("_hp", ""); fd.set("_t", String(now - 3000));
  assert.equal(checkHoneypot(fd, now), "ok");
});

test("bans: block, expire, lift; repeated offences auto-ban; canary accounts are recognised", async () => {
  const db = await createTestDb();
  const t0 = new Date("2026-11-01T10:00:00Z");
  assert.equal(await isBanned(db, "203.0.113.5", t0), false);
  await banIp(db, "203.0.113.5", "test", 600, "auto", t0);
  assert.equal(await isBanned(db, "203.0.113.5", new Date(t0.getTime() + 60_000)), true);
  assert.equal(await isBanned(db, "203.0.113.5", new Date(t0.getTime() + 601_000)), false, "expires");
  await banIp(db, "198.51.100.1", "x", 3600); await unbanIp(db, "198.51.100.1");
  assert.equal(await isBanned(db, "198.51.100.1"), false);
  for (let i = 0; i < 3; i++) await recordSecurityEvent(db, { type: "canary_login", ip: "192.0.2.9" });
  assert.equal(await maybeAutoBan(db, "192.0.2.9", "canary_login", { threshold: 3, windowSeconds: 3600, banSeconds: 3600 }), true);
  assert.equal(await isBanned(db, "192.0.2.9"), true);
  assert.equal(await maybeAutoBan(db, "192.0.2.77", "canary_login", { threshold: 3, windowSeconds: 3600, banSeconds: 3600 }), false);
  assert.ok((await listSecurity(db)).events.some((e) => e.type === "ban"));
  assert.ok(isCanaryEmail("Admin@whatever.com") && isCanaryEmail("root@x.io") && !isCanaryEmail("olivia@mamaoliech.co.ke"));
});

test("TOTP matches the RFC 6238 vector, tolerates one step of drift and never accepts a code twice", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(secret, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(totpAt(secret, Math.floor(59 / 30)), "287082"); // RFC 6238 appendix B (SHA-1, T=59), last 6 digits
  assert.equal(totpAt(secret, Math.floor(1111111109 / 30)), "081804");
  assert.deepEqual(base32Decode(secret), Buffer.from("12345678901234567890"));
  const now = new Date(59_000);
  const step = verifyTotp(secret, "287082", now);
  assert.equal(step, 1);
  assert.equal(verifyTotp(secret, "287082", now, step!), null, "replay refused");
  assert.equal(verifyTotp(secret, "287082", new Date(59_000 + 30_000)), 1, "one step late is fine");
  assert.equal(verifyTotp(secret, "287082", new Date(59_000 + 120_000)), null, "stale");
  assert.equal(verifyTotp(secret, "12345", now), null); assert.equal(verifyTotp(secret, "abcdef", now), null);
  assert.match(newTotpSecret(), /^[A-Z2-7]{32}$/);
  assert.match(otpauthUri(secret, "a@b.co"), /^otpauth:\/\/totp\/Restaurant%20OS:a%40b\.co\?secret=/);
});

test("operator two-factor: enrol, require a code at sign-in, single-use recovery codes, secure disable", async () => {
  const db = await createTestDb();
  const pw = "Correct-Horse-Battery-9!";
  const { id } = await createPlatformAdmin(db, { name: "Ops", email: "ops@example.com", password: pw });
  const now = new Date("2026-11-01T10:00:00Z");
  assert.ok((await loginPlatformAdmin(db, { email: "ops@example.com", password: pw, now })).token, "works without 2FA until enrolled");

  const { secret } = await beginTwoFactor(db, id);
  await assert.rejects(() => confirmTwoFactor(db, id, "000000", now), /not valid/);
  const step0 = Math.floor(now.getTime() / 30_000);
  const { recoveryCodes } = await confirmTwoFactor(db, id, totpAt(secret, step0), now);
  assert.equal(recoveryCodes.length, 8);
  assert.deepEqual(await twoFactorStatus(db, id), { enabled: true, recoveryLeft: 8 });
  const stored = await db.col("platformAdmins").findOne({ id });
  assert.ok(!JSON.stringify(stored).includes(secret), "TOTP secret encrypted at rest");
  assert.ok(!JSON.stringify(stored).includes(recoveryCodes[0]!.replace("-", "")), "recovery codes stored hashed");

  const later = new Date(now.getTime() + 60_000); const step1 = Math.floor(later.getTime() / 30_000);
  await assert.rejects(() => loginPlatformAdmin(db, { email: "ops@example.com", password: pw, now: later }), /6-digit/);
  await assert.rejects(() => loginPlatformAdmin(db, { email: "ops@example.com", password: pw, code: "123456", now: later }), /not valid/);
  await assert.rejects(() => loginPlatformAdmin(db, { email: "ops@example.com", password: "wrong-password-1!", code: totpAt(secret, step1), now: later }), /Incorrect/);
  assert.ok((await loginPlatformAdmin(db, { email: "ops@example.com", password: pw, code: totpAt(secret, step1), now: later })).token);
  await assert.rejects(() => loginPlatformAdmin(db, { email: "ops@example.com", password: pw, code: totpAt(secret, step1), now: later }), /not valid/, "same code twice");
  const rec = recoveryCodes[0]!;
  assert.ok((await loginPlatformAdmin(db, { email: "ops@example.com", password: pw, code: rec, now: later })).token);
  await assert.rejects(() => loginPlatformAdmin(db, { email: "ops@example.com", password: pw, code: rec, now: later }), /not valid/, "recovery codes are single-use");
  assert.equal((await twoFactorStatus(db, id)).recoveryLeft, 7);

  await assert.rejects(() => disableTwoFactor(db, id, { password: "nope-nope-nope-1", code: recoveryCodes[1]! }), /not valid/);
  await disableTwoFactor(db, id, { password: pw, code: recoveryCodes[1]! });
  assert.equal((await twoFactorStatus(db, id)).enabled, false);
});

test("stored documents cannot carry operator or path-injection keys", () => {
  assertSafeDocument({ name: "ok", nested: { list: [{ a: 1 }] } });
  assert.throws(() => assertSafeDocument({ name: { $gt: "" } }), /illegal field name/);
  assert.throws(() => assertSafeDocument({ "a.b": 1 }), /illegal field name/);
  assert.throws(() => assertSafeDocument({ list: [{ $where: "1" }] }), /illegal field name/);
});

test("production refuses placeholder secrets, http URLs and the in-memory database", () => {
  const saved = { ...process.env };
  const good = { NODE_ENV: "production", MONGODB_URI: "mongodb://db.internal/?replicaSet=rs0", APP_SECRET: "Zq8vN2mXw5Lp9TrB4cYd7HfJ1sGe3UoAkR6", APP_URL: "https://pos.example.com" };
  const tryEnv = (o: Record<string, string>) => { process.env = { ...saved, ...good, ...o } as NodeJS.ProcessEnv; __resetEnvForTests(); try { return env(); } finally { process.env = saved; __resetEnvForTests(); } };
  assert.equal(tryEnv({}).TRUSTED_PROXY_HOPS, 1);
  assert.throws(() => tryEnv({ APP_SECRET: "replace-with-a-long-random-string-xxxxxxxx" }), /placeholder/);
  assert.throws(() => tryEnv({ APP_SECRET: "a".repeat(40) }), /placeholder/);
  assert.throws(() => tryEnv({ APP_URL: "http://pos.example.com" }), /https/);
  assert.throws(() => tryEnv({ MONGODB_URI: "memory" }), /development only/);
});

test("webhook endpoint: oversize bodies are refused; bad signatures answer 401 and are logged", async () => {
  const big = await webhookResponse(new Request("https://x.test/api/webhooks/paystack", { method: "POST", headers: { "content-length": String(300 * 1024) }, body: "{}" }), null);
  assert.equal(big.status, 413);
  const bad = await webhookResponse(new Request("https://x.test/api/webhooks/paystack", { method: "POST", headers: { "x-paystack-signature": "00", "x-forwarded-for": "203.0.113.50" }, body: '{"event":"charge.success"}' }), null);
  assert.equal(bad.status, 401);
  const { getDb } = await import("@/platform/db");
  const { events } = await listSecurity(await getDb());
  assert.ok(events.some((e) => e.type === "bad_signature" && e.ip === "203.0.113.50"));
});
