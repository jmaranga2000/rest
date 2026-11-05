import { requirePlatformPage } from "@/modules/platform-admin/request";
import { twoFactorStatus } from "@/modules/platform-admin/auth";
import { SecurityPage } from "@/modules/platform-admin/views/SecurityViews";
import { listSecurity } from "@/platform/security/store";
export const metadata = { title: "Security" };
export default async function Page() {
  const ctx = await requirePlatformPage();
  const { events, bans } = await listSecurity(ctx.db);
  return <SecurityPage events={events} bans={bans} twoFactor={await twoFactorStatus(ctx.db, ctx.adminId)} allowList={!!process.env.PLATFORM_ALLOWED_IPS?.trim()} />;
}
