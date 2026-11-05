import "./_env";
import { getDb } from "@/platform/db";
import { prepareDatabase } from "@/platform/bootstrap";
import { provisionOrganization } from "@/modules/organizations/provision";
import { createSession } from "@/platform/auth/sessions";
import { loadContext } from "@/platform/auth/context";
import * as admin from "@/modules/admin/service";
import { onboardingSchema, staffSchema } from "@/modules/admin/schema";
import * as orders from "@/modules/orders/service";
import { getCatalog } from "@/modules/menu/service";

/** Creates a demo restaurant with staff, a menu, tables and a day of orders. Safe to re-run (skips if the demo owner exists). */
async function main() {
  const db = await getDb();
  await prepareDatabase(db);
  const email = "demo@restaurant-os.test";
  if (await db.col("users").findOne({ emailLower: email })) { console.log(`Demo already exists: ${email}`); process.exit(0); }
  const { orgId, ownerId, branchId } = await provisionOrganization(db, { businessName: "Mama Oliech Kitchen", ownerName: "Olivia Wanjiru", ownerEmail: email, ownerPassword: "Savanna-Orchid-2026!" });
  const ctxFor = async (uid: string) => loadContext(db, (await createSession(db, { orgId, userId: uid, branchId, kind: "web" })).token);
  const owner = await ctxFor(ownerId);
  await admin.completeOnboarding(owner, onboardingSchema.parse({ currency: "KES", timezone: "Africa/Nairobi", taxRatePercent: "16", taxInclusive: "on", tableCount: "8", sampleMenu: "on" }));
  const role = async (k: string) => (await db.col("roles").findOne({ orgId, key: k }))!.id;
  await admin.saveStaff(owner, staffSchema.parse({ name: "Brian Otieno", roleId: await role("cashier"), branchIds: [branchId], pin: "1234" }));
  await admin.saveStaff(owner, staffSchema.parse({ name: "Achieng Auma", roleId: await role("manager"), branchIds: [branchId], email: "manager@restaurant-os.test", password: "Savanna-Orchid-2026!" }));

  const ctx = await ctxFor(ownerId);
  const catalog = await getCatalog(ctx, { branchId });
  await orders.openShift(ctx, { branchId, openingFloatMinor: 500000 });
  const methods = ["cash", "mpesa", "card"] as const;
  for (let n = 0; n < 12; n += 1) {
    const o = await orders.openOrder(ctx, { branchId, type: "takeaway" });
    const picks = [catalog.products[n % catalog.products.length]!, catalog.products[(n * 3 + 1) % catalog.products.length]!];
    await orders.addItems(ctx, o.id, picks.map((p, i) => ({ productId: p.id, qty: 1 + ((n + i) % 3) })));
    await orders.sendToKitchen(ctx, o.id);
    const full = await orders.getOrder(ctx, o.id);
    await orders.pay(ctx, o.id, { orderId: o.id, method: methods[n % 3]!, amountMinor: full.totalMinor, tenderedMinor: n % 3 === 0 ? full.totalMinor + 10000 : undefined, reference: n % 3 === 1 ? `QGH${1000 + n}XK` : undefined } as never);
  }
  console.log("Seeded demo restaurant.\n  Owner:   demo@restaurant-os.test / Savanna-Orchid-2026!\n  Manager: manager@restaurant-os.test / Savanna-Orchid-2026!\n  Cashier PIN (after pairing a device): Brian Otieno / 1234");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
