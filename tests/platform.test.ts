import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allocate, bpOf, formatMoney, parseMoney, roundHalfAway } from "@/platform/money";
import { newId } from "@/platform/ids";
import { businessDate, addDays, eachDay } from "@/platform/dates";
import { subscriptionAccess, assertWithinLimit, assertWritable, GRACE_DAYS } from "@/platform/tenancy/entitlements";
import { hashSecret, verifySecret, passwordProblem } from "@/platform/auth/password";
import { ALL_PERMISSIONS } from "@/platform/rbac/permissions";
import { SYSTEM_ROLES } from "@/platform/rbac/roles";
import { createMemoryDb, DuplicateKeyError } from "@/platform/db";
import { matches } from "@/platform/store/filter";

describe("money", () => {
  it("allocates exactly, with no lost cents", () => {
    const parts = allocate(100, [1, 1, 1]);
    assert.equal(parts.reduce((a, b) => a + b, 0), 100);
    assert.deepEqual(parts.sort(), [33, 33, 34]);
    assert.deepEqual(allocate(0, [3, 4]), [0, 0]);
    assert.equal(allocate(1001, [10, 20, 30, 40]).reduce((a, b) => a + b, 0), 1001);
  });
  it("computes basis-point shares with half-away rounding", () => {
    assert.equal(bpOf(1000, 1600), 160);
    assert.equal(bpOf(5, 5000), 3); // 2.5 → 3
    assert.equal(roundHalfAway(-2.5), -3);
  });
  it("formats and parses", () => {
    assert.match(formatMoney(125050, "KES"), /1,250\.50/);
    assert.equal(parseMoney("1,250.50", "KES"), 125050);
    assert.equal(parseMoney("abc", "KES"), null);
  });
});

describe("ids & dates", () => {
  it("ids are prefixed and time-sortable", () => {
    const a = newId("order", 1_000_000);
    const b = newId("order", 2_000_000);
    assert.ok(a.startsWith("ord_"));
    assert.ok(a < b);
    assert.equal(a.length, 4 + 24);
  });
  it("business date follows the branch timezone", () => {
    // 22:30 UTC on the 1st is already the 2nd in Nairobi (UTC+3)
    assert.equal(businessDate("2026-03-01T22:30:00Z", "Africa/Nairobi"), "2026-03-02");
    assert.equal(businessDate("2026-03-01T22:30:00Z", "UTC"), "2026-03-01");
    assert.equal(addDays("2026-02-28", 1), "2026-03-01");
    assert.deepEqual(eachDay("2026-03-01", "2026-03-03"), ["2026-03-01", "2026-03-02", "2026-03-03"]);
  });
});

describe("document store (memory engine, MongoDB semantics)", () => {
  it("matches the operator subset the app relies on", () => {
    const d = { a: 1, b: "x", c: null, tags: ["p", "q"] };
    assert.ok(matches(d, { a: { $gte: 1, $lt: 2 }, b: { $in: ["x", "y"] } }));
    assert.ok(matches(d, { c: null, missing: null }));      // null matches null and missing
    assert.ok(matches(d, { tags: "p" }));                    // array membership
    assert.ok(!matches(d, { a: { $ne: 1 } }));
    assert.ok(matches(d, { $or: [{ a: 9 }, { b: { $regex: "^X$", $options: "i" } }] }));
    assert.ok(matches(d, { b: { $type: "string" }, c: { $exists: true } }));
  });
  it("enforces unique and partial unique indexes", async () => {
    const db = createMemoryDb();
    await db.col("customers").insert({ id: "c1", orgId: "o", phone: "+1" });
    await assert.rejects(db.col("customers").insert({ id: "c2", orgId: "o", phone: "+1" }), DuplicateKeyError);
    await db.col("customers").insert({ id: "c3", orgId: "o", phone: null });   // partial: nulls are exempt
    await db.col("customers").insert({ id: "c4", orgId: "o", phone: null });
    await db.col("customers").insert({ id: "c5", orgId: "p", phone: "+1" });   // other tenant is fine
  });
  it("rolls back a failed transaction completely and serialises writers", async () => {
    const db = createMemoryDb();
    await db.col("plans").insert({ id: "p1", code: "a" });
    await assert.rejects(db.tx(async (tx) => { await tx.col("plans").insert({ id: "p2", code: "b" }); throw new Error("boom"); }), /boom/);
    assert.equal(await db.col("plans").count({}), 1);
    await Promise.all([1, 2, 3].map(() => db.tx(async (tx) => { const c = (await tx.col<{ id: string; n: number }>("counters").findOne({ id: "x" }))?.n ?? 0; await tx.col("counters").findOneAndUpdate({ id: "x" }, { $set: { n: c + 1 } }, { upsert: true }); })));
    assert.equal((await db.col<{ id: string; n: number }>("counters").findOne({ id: "x" }))!.n, 3);
  });
  it("findOneAndUpdate is an atomic counter", async () => {
    const db = createMemoryDb();
    const inc = () => db.col<{ id: string; value: number }>("counters").findOneAndUpdate({ id: "k" }, { $inc: { value: 1 } }, { upsert: true });
    assert.equal((await inc())!.value, 1);
    assert.equal((await inc())!.value, 2);
  });
});

describe("subscription access", () => {
  const base = { planCode: "professional", cancelAtPeriodEnd: false, trialEndsAt: null, currentPeriodEnd: null } as const;
  const now = new Date("2026-06-15T12:00:00Z");
  it("trial is full until it ends, then read-only", () => {
    assert.equal(subscriptionAccess({ ...base, status: "trialing", trialEndsAt: "2026-06-30T00:00:00Z" }, "active", now).level, "full");
    assert.equal(subscriptionAccess({ ...base, status: "trialing", trialEndsAt: "2026-06-17T00:00:00Z" }, "active", now).reason, "trial_ending");
    const expired = subscriptionAccess({ ...base, status: "trialing", trialEndsAt: "2026-06-10T00:00:00Z" }, "active", now);
    assert.equal(expired.level, "read_only");
    assert.throws(() => assertWritable(expired), /trial has ended/);
  });
  it("paid plans get a grace period after a missed renewal", () => {
    const period = "2026-06-10T00:00:00Z";
    const a = subscriptionAccess({ ...base, status: "active", currentPeriodEnd: period }, "active", now);
    assert.equal(a.level, "full");
    assert.equal(a.reason, "grace_period");
    const later = new Date(new Date(period).getTime() + (GRACE_DAYS + 1) * 86_400_000);
    assert.equal(subscriptionAccess({ ...base, status: "active", currentPeriodEnd: period }, "active", later).level, "read_only");
  });
  it("suspension always blocks", () => {
    assert.equal(subscriptionAccess({ ...base, status: "active" }, "suspended", now).level, "blocked");
    assert.equal(subscriptionAccess({ ...base, status: "suspended" }, "active", now).level, "blocked");
  });
  it("enforces numeric limits, null = unlimited", () => {
    assert.throws(() => assertWithinLimit({ branches: 1, users: 5, terminals: 2 }, "branches", 1, "branches"), /allows 1 branches/);
    assert.doesNotThrow(() => assertWithinLimit({ branches: null, users: null, terminals: null }, "users", 9999, "staff"));
  });
});

describe("passwords", () => {
  it("hashes with scrypt and verifies", async () => {
    const h = await hashSecret("correct horse battery");
    assert.ok(h.startsWith("scrypt$"));
    assert.equal(await verifySecret("correct horse battery", h), true);
    assert.equal(await verifySecret("wrong", h), false);
    assert.equal(await verifySecret("anything", null), false);
  });
  it("rejects weak passwords", () => {
    assert.ok(passwordProblem("short"));
    assert.ok(passwordProblem("aaaaaaaaaaaa"));
    assert.equal(passwordProblem("a-long-enough-passphrase"), null);
  });
});

describe("rbac catalogue", () => {
  it("system roles only reference real permissions", () => {
    const all = new Set<string>(ALL_PERMISSIONS);
    for (const role of SYSTEM_ROLES) for (const p of role.permissions) assert.ok(all.has(p), `${role.key} → ${p}`);
  });
  it("owner holds every permission; cashier cannot refund or manage staff", () => {
    const owner = SYSTEM_ROLES.find((r) => r.key === "owner")!;
    assert.equal(owner.permissions.length, ALL_PERMISSIONS.length);
    const cashier = SYSTEM_ROLES.find((r) => r.key === "cashier")!;
    assert.ok(!cashier.permissions.includes("payments.refund"));
    assert.ok(!cashier.permissions.includes("staff.manage"));
  });
});
