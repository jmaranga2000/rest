import type { Db } from "@/platform/db";
import { createMemoryDb } from "@/platform/db";
import { __setEnvForTests } from "@/platform/env";
import { provisionOrganization } from "@/modules/organizations/provision";
import { createSession } from "@/platform/auth/sessions";
import { loadContext, type Ctx } from "@/platform/auth/context";

process.env.APP_SECRET ??= "test-secret-test-secret-test-secret-0123456789";
__setEnvForTests({ APP_SECRET: process.env.APP_SECRET });

export async function createTestDb(): Promise<Db> {
  // Set MONGODB_TEST_URI (a replica-set URI, since transactions need one) to run the whole suite against a real MongoDB.
  const uri = process.env.MONGODB_TEST_URI;
  const db = uri ? await (await import("@/platform/store/mongo")).createMongoDb(uri, `ros_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`) : createMemoryDb();
  await db.ensureIndexes();
  return db;
}

export interface TestTenant {
  db: Db;
  orgId: string;
  ownerId: string;
  branchId: string;
  owner: Ctx;
  /** Build a context for another user of the same tenant. */
  ctxFor(userId: string, branchId?: string | null): Promise<Ctx>;
}

let counter = 0;
export async function createTenant(db?: Db, opts: { plan?: string; name?: string } = {}): Promise<TestTenant> {
  const handle = db ?? (await createTestDb());
  counter += 1;
  const { orgId, ownerId, branchId } = await provisionOrganization(handle, {
    businessName: opts.name ?? `Test Bistro ${counter}`, ownerName: "Olivia Owner",
    ownerEmail: `owner${counter}@example.com`, ownerPassword: "correct horse battery", planCode: opts.plan,
  });
  await handle.col("organizations").update({ id: orgId }, { $set: { onboardingStatus: "completed" } });
  const ctxFor = async (userId: string, bId: string | null = branchId): Promise<Ctx> => {
    const s = await createSession(handle, { orgId, userId, branchId: bId, kind: "web" });
    return loadContext(handle, s.token);
  };
  return { db: handle, orgId, ownerId, branchId, owner: await ctxFor(ownerId), ctxFor };
}
