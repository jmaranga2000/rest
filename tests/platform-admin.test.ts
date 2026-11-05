import test from "node:test";
import assert from "node:assert/strict";
import { createTenant } from "./helpers";
import { createPlatformAdmin, loadPlatformCtx, loginPlatformAdmin } from "@/modules/platform-admin/auth";
import * as p from "@/modules/platform-admin/service";
import { requestPlanChange } from "@/modules/admin/service";
import { loginWithPassword } from "@/modules/identity/auth.service";

test("operator console: login, org list, suspend blocks tenant, payment reactivates, plan requests", async () => {
  const t = await createTenant();
  await createPlatformAdmin(t.db, { name: "Root", email: "root@example.com", password: "Zx9-long-platform-pass" });
  const { token } = await loginPlatformAdmin(t.db, { email: "ROOT@example.com", password: "Zx9-long-platform-pass" });
  const ctx = await loadPlatformCtx(t.db, token);
  await assert.rejects(() => loginPlatformAdmin(t.db, { email: "root@example.com", password: "wrong" }));

  const orgs = await p.listOrgs(ctx, { q: "test bistro" });
  assert.equal(orgs.length, 1); assert.equal(orgs[0]!.userCount, 1);
  assert.equal((await p.getStats(ctx)).orgs, 1);

  await p.suspendOrg(ctx, t.orgId, "Unpaid");
  const email = (await t.db.col<{ id: string; email: string }>("users").findOne({ id: t.ownerId }))!.email;
  assert.equal((await loginWithPassword(t.db, { email, password: "correct horse battery" })).home, "/suspended");
  await p.recordPayment(ctx, { id: t.orgId, amountMinor: 950000, method: "mpesa", reference: "QGH1" });
  const after = await p.getOrgDetail(ctx, t.orgId);
  assert.equal(after.org.status, "active"); assert.equal(after.org.subStatus, "active"); assert.equal(after.payments.length, 1);

  await requestPlanChange(await t.ctxFor(t.ownerId), "starter", "downgrade");
  const [req] = await p.listPlanRequests(ctx);
  await p.reviewRequest(ctx, req!.id, true);
  assert.equal((await p.getOrgDetail(ctx, t.orgId)).org.planCode, "starter");
  await assert.rejects(() => p.reviewRequest(ctx, req!.id, false), /already reviewed/);
  assert.ok((await p.listPlatformAudit(ctx)).length >= 3);
});
