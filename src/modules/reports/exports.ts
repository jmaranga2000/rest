import type { Ctx } from "@/platform/auth/context";
import { minorToInput } from "@/platform/money";
import { PAYMENT_METHOD_LABEL } from "@/platform/tenancy/settings";
import { raw, type Cell } from "./csv";
import type { DateRange } from "./range";
import * as svc from "./service";

export const REPORT_KEYS = ["sales", "products", "payments", "staff", "hours", "branches"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];
export const isReportKey = (v: string): v is ReportKey => (REPORT_KEYS as readonly string[]).includes(v);

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Rows for a report's CSV (header first). Money is written as plain decimals in the organisation currency. */
export async function reportRows(ctx: Ctx, key: ReportKey, scope: svc.Scope, range: DateRange): Promise<Cell[][]> {
  const cur = ctx.org.currency;
  const m = (minor: number): Cell => raw(minorToInput(minor, cur));
  const financial = ctx.permissions.has("reports.financial");
  switch (key) {
    case "sales": {
      const rows = await svc.getDailySales(ctx, scope, range);
      return [["Date", "Orders", `Revenue (${cur})`, ...(financial ? [`Tax (${cur})`] : []), `Discounts (${cur})`, `Service charge (${cur})`, "Voided orders"],
        ...rows.map((r) => [r.date, r.orders, m(r.revenueMinor), ...(financial ? [m(r.taxMinor)] : []), m(r.discountMinor), m(r.serviceChargeMinor), r.voids])];
    }
    case "products": {
      const { products } = await svc.getProductSales(ctx, scope, range);
      return [["Item", "Category", "Quantity", `Revenue (${cur})`], ...products.map((p) => [p.name, p.categoryName, p.qty, m(p.revenueMinor)])];
    }
    case "payments": {
      const p = await svc.getPaymentsReport(ctx, scope, range);
      return [["Type", "Method", "Count", `Amount (${cur})`],
        ...p.mix.map((r) => ["Payment", PAYMENT_METHOD_LABEL[r.method] ?? r.method, r.count, m(r.amountMinor)]),
        ...p.refunds.map((r) => ["Refund", PAYMENT_METHOD_LABEL[r.method] ?? r.method, r.count, m(-r.amountMinor)])];
    }
    case "staff": {
      const rows = await svc.getStaffReport(ctx, scope, range);
      return [["Staff", "Orders", `Revenue (${cur})`, `Average order (${cur})`, `Discounts (${cur})`, "Voided orders"],
        ...rows.map((r) => [r.name, r.orders, m(r.revenueMinor), m(r.aovMinor), m(r.discountMinor), r.voids])];
    }
    case "hours": {
      const h = await svc.getHoursReport(ctx, scope, range);
      return [["Weekday", "Hour", "Orders", `Revenue (${cur})`],
        ...h.matrix.flatMap((row, d) => row.map((b, hour) => ({ d, hour, b })).filter((x) => x.b.orders > 0).map((x) => [DAYS[x.d]!, `${String(x.hour).padStart(2, "0")}:00`, x.b.orders, m(x.b.revenueMinor)] as Cell[]))];
    }
    case "branches": {
      const rows = await svc.getBranchComparison(ctx, scope, range);
      return [["Branch", "Orders", `Revenue (${cur})`, `Average order (${cur})`, `Discounts (${cur})`, "Voided orders"],
        ...rows.map((r) => [r.name, r.orders, m(r.revenueMinor), m(r.aovMinor), m(r.discountMinor), r.voids])];
    }
  }
}
