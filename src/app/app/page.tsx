import { requirePage } from "@/platform/http/request";
import { getDashboard } from "@/modules/reports/service";
import { DashboardPage } from "@/modules/reports/views/DashboardPage";

export const metadata = { title: "Dashboard" };
export default async function Page({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const ctx = await requirePage();
  const sp = await searchParams;
  const data = await getDashboard(ctx, sp.branch);
  return <DashboardPage data={data} currency={ctx.org.currency} userName={ctx.userName} branchId={ctx.activeBranch?.id ?? null} />;
}
