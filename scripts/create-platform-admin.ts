import "./_env";
import { getDb } from "@/platform/db";
import { prepareDatabase } from "@/platform/bootstrap";
import { env } from "@/platform/env";
import { createPlatformAdmin } from "@/modules/platform-admin/auth";

async function main() {
  const { PLATFORM_ADMIN_NAME, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD } = env();
  if (!PLATFORM_ADMIN_EMAIL || !PLATFORM_ADMIN_PASSWORD) {
    throw new Error("Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD in .env before creating the platform admin.");
  }
  const db = await getDb();
  await prepareDatabase(db);
  const { id } = await createPlatformAdmin(db, {
    name: PLATFORM_ADMIN_NAME ?? "Platform Administrator",
    email: PLATFORM_ADMIN_EMAIL,
    password: PLATFORM_ADMIN_PASSWORD,
  });
  console.log(`Platform admin created (${id}). Sign in at /platform/login.`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
