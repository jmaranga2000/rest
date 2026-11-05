import { requirePage } from "@/platform/http/request";
import * as svc from "@/modules/reports/service";
import { parseRange } from "@/modules/reports/range";
import { isReportKey, REPORT_KEYS, type ReportKey } from "@/modules/reports/exports";
import { ReportsPage } from "@/modules/reports/views/ReportsPage";

export const metadata = { title: "Reports" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePage({ anyPermission: ["reports.view", "reports.financial"] });
  const sp = await searchParams;
  const scope = svc.resolveScope(ctx, sp.branch);
  const range = parseRange({ preset: sp.preset, from: sp.from, to: sp.to }, scope.timezone);
  const tabs = REPORT_KEYS.filter((k) => (k !== "branches" || (scope.options.length > 1 && ctx.permissions.has("reports.financial"))));
  const tab: ReportKey = sp.tab && isReportKey(sp.tab) && tabs.includes(sp.tab) ? sp.tab : "sales";
  const [summary, daily, products, payments, staff, hours, branches] = await Promise.all([
    svc.getSalesSummary(ctx, scope, range), svc.getDailySales(ctx, scope, range), svc.getProductSales(ctx, scope, range), svc.getPaymentsReport(ctx, scope, range),
    svc.getStaffReport(ctx, scope, range), svc.getHoursReport(ctx, scope, range), tabs.includes("branches") ? svc.getBranchComparison(ctx, resolveAll(ctx), range) : Promise.resolve(null),
  ]);
  return <ReportsPage tab={tab} tabs={[...tabs]} range={range} scope={scope} currency={ctx.org.currency} canExport={ctx.permissions.has("reports.export")} data={{ summary, daily, products, payments, staff, hours, branches }} />;
}
function resolveAll(ctx: Parameters<typeof svc.resolveScope>[0]) { return svc.resolveScope(ctx, "all"); }
