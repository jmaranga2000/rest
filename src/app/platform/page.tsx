import { requirePlatformPage } from "@/modules/platform-admin/request";
import { getStats, listOrgs } from "@/modules/platform-admin/service";
import { platformPaystackInfo } from "@/modules/payments/service";
import { PlatformPaystackCard } from "@/modules/payments/views/PlatformPaystackCard";
import { PlatformDashboard } from "@/modules/platform-admin/views/PlatformViews";
export const metadata = { title: "Operator console" };
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requirePlatformPage();
  const { q } = await searchParams;
  return <><PlatformPaystackCard info={platformPaystackInfo()} /><PlatformDashboard stats={await getStats(ctx)} orgs={await listOrgs(ctx, { q })} q={q} /></>;
}
