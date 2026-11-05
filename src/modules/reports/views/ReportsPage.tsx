import Link from "next/link";
import { LuDownload } from "react-icons/lu";
import { Button } from "@/ui/Button";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { PageHeader, StatCard, Tabs } from "@/ui/misc";
import { BarChart, Donut, HBarList, LineChart } from "@/ui/charts";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatMoney } from "@/platform/money";
import { PAYMENT_METHOD_LABEL } from "@/platform/tenancy/settings";
import { PRESETS, type DateRange } from "../range";
import type { BranchRow, DailyRow, HoursReport, PaymentsReport, ProductRow, CategoryShare, SalesSummary, Scope, StaffRow } from "../service";
import type { ReportKey } from "../exports";

export interface ReportData {
  summary: SalesSummary; daily: DailyRow[]; products: { products: ProductRow[]; categories: CategoryShare[] }; payments: PaymentsReport; staff: StaffRow[]; hours: HoursReport; branches: BranchRow[] | null;
}
const LABEL: Record<ReportKey, string> = { sales: "Sales", products: "Items", payments: "Payments", staff: "Staff", hours: "Busy hours", branches: "Branches" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ReportsPage({ tab, tabs, range, scope, data, currency, canExport }: { tab: ReportKey; tabs: ReportKey[]; range: DateRange; scope: Scope; data: ReportData; currency: string; canExport: boolean }) {
  const fmt = (n: number) => formatMoney(n, currency);
  const qs = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v) p.set(k, v); const s = p.toString(); return s ? `?${s}` : ""; };
  const base = { tab, branch: scope.isAll ? "all" : scope.branchId ?? undefined };
  const exportHref = `/api/export${qs({ report: tab, branch: base.branch, from: range.from, to: range.to })}`;
  const s = data.summary;
  return (
    <>
      <PageHeader title="Reports" description={`${scope.label} · ${range.label} (${range.from} → ${range.to})`} actions={canExport ? <Button variant="outline" href={exportHref} icon={<LuDownload className="size-4" />}>Export CSV</Button> : null} />
      <form className="mb-4 flex flex-wrap items-end gap-3" action="/app/reports">
        <input type="hidden" name="tab" value={tab} />
        <div className="flex flex-wrap gap-1.5">{PRESETS.map((p) => <Link key={p.key} href={`/app/reports${qs({ ...base, preset: p.key })}`} className={`rounded-full px-3 py-1.5 text-sm font-medium ${range.preset === p.key ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-fg"}`}>{p.label}</Link>)}</div>
        <div className="flex items-end gap-2"><label className="text-xs text-muted">From<input type="date" name="from" defaultValue={range.from} className="control mt-1" /></label><label className="text-xs text-muted">To<input type="date" name="to" defaultValue={range.to} className="control mt-1" /></label><Button type="submit" variant="outline">Apply</Button></div>
        {scope.canChoose ? <label className="text-xs text-muted">Branch<select name="branch" defaultValue={scope.isAll ? "all" : scope.branchId ?? ""} className="control mt-1">{scope.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}{scope.options.length > 1 && tabs.includes("branches") ? <option value="all">All branches</option> : null}</select></label> : null}
      </form>
      <Tabs items={tabs.map((t) => ({ href: `/app/reports${qs({ ...base, tab: t, preset: range.preset === "custom" ? undefined : range.preset, from: range.preset === "custom" ? range.from : undefined, to: range.preset === "custom" ? range.to : undefined })}`, label: LABEL[t], active: tab === t }))} />
      <div className="mt-6 space-y-6">
        {tab === "sales" ? (<>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Revenue" value={fmt(s.revenueMinor)} hint={`${s.orders} orders`} /><StatCard label="Average order" value={fmt(s.aovMinor)} />
            <StatCard label="Discounts" value={fmt(s.discountMinor)} />{s.taxMinor != null ? <StatCard label="Tax collected" value={fmt(s.taxMinor)} hint={s.netSalesMinor != null ? `Net ${fmt(s.netSalesMinor)}` : undefined} /> : <StatCard label="Service charge" value={fmt(s.serviceChargeMinor)} />}
            <StatCard label="Voided orders" value={s.voidOrders} hint={fmt(s.voidOrdersMinor)} /><StatCard label="Voided items" value={s.voidItems} hint={fmt(s.voidItemsMinor)} /><StatCard label="Refunds" value={fmt(s.refundsMinor)} hint={`${s.refundCount} refund${s.refundCount === 1 ? "" : "s"}`} /><StatCard label="Net after refunds" value={fmt(s.netAfterRefundsMinor)} />
          </div>
          <Card><CardHeader title="Daily revenue" /><CardBody><BarChart data={data.daily.map((d) => ({ label: d.date.slice(5), value: d.revenueMinor }))} format={fmt} /></CardBody></Card>
        </>) : null}
        {tab === "products" ? (<div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2"><CardHeader title="Best sellers" /><CardBody><HBarList items={data.products.products.slice(0, 15).map((p) => ({ label: p.name, value: p.revenueMinor, sub: `×${p.qty}` }))} format={fmt} /></CardBody></Card>
          <Card><CardHeader title="By category" /><CardBody><Donut segments={data.products.categories.map((c) => ({ label: c.name, value: c.revenueMinor }))} /></CardBody></Card></div>) : null}
        {tab === "payments" ? (<div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader title="Received by method" description={`Total ${fmt(data.payments.receivedMinor)}`} /><CardBody><Donut segments={data.payments.mix.map((m) => ({ label: PAYMENT_METHOD_LABEL[m.method] ?? m.method, value: m.amountMinor }))} /></CardBody></Card>
          <Card><CardHeader title="Summary" /><Table><TBody>
            {data.payments.mix.map((m) => <TR key={m.method}><TD>{PAYMENT_METHOD_LABEL[m.method] ?? m.method}<span className="ml-2 text-xs text-muted">{m.count} payments</span></TD><TD align="right" className="num">{fmt(m.amountMinor)}</TD></TR>)}
            <TR><TD className="text-danger">Refunded</TD><TD align="right" className="num text-danger">−{fmt(data.payments.refundedMinor)}</TD></TR><TR><TD className="font-semibold">Net</TD><TD align="right" className="num font-semibold">{fmt(data.payments.netMinor)}</TD></TR></TBody></Table></Card></div>) : null}
        {tab === "staff" ? (<Card className="overflow-x-auto"><Table><THead><TR><TH>Staff</TH><TH align="right">Orders</TH><TH align="right">Revenue</TH><TH align="right">Avg order</TH><TH align="right">Discounts</TH><TH align="right">Voids</TH></TR></THead>
          <TBody>{data.staff.map((r) => <TR key={r.userId}><TD className="font-medium">{r.name}</TD><TD align="right" className="num">{r.orders}</TD><TD align="right" className="num">{fmt(r.revenueMinor)}</TD><TD align="right" className="num">{fmt(r.aovMinor)}</TD><TD align="right" className="num">{fmt(r.discountMinor)}</TD><TD align="right" className="num">{r.voids}</TD></TR>)}</TBody></Table></Card>) : null}
        {tab === "hours" ? (<Card><CardHeader title="Orders by hour opened" description={data.hours.peakHour != null ? `Busiest hour: ${String(data.hours.peakHour).padStart(2, "0")}:00` : undefined} /><CardBody>
          <BarChart data={data.hours.hourly.map((h, i) => ({ label: String(i), value: h.orders }))} height={200} />
          <div className="mt-6 overflow-x-auto"><table className="text-xs"><tbody>{DAYS.map((d, di) => <tr key={d}><td className="pr-3 text-muted">{d}</td>{data.hours.matrix[di]!.slice(6, 24).map((b, h) => { const max = Math.max(1, ...data.hours.matrix.flat().map((x) => x.orders)); return <td key={h} title={`${d} ${h + 6}:00 — ${b.orders} orders`} className="size-5 border border-bg" style={{ background: b.orders ? `color-mix(in srgb, var(--primary) ${Math.round(15 + (b.orders / max) * 85)}%, transparent)` : "var(--surface-2)", width: 22, height: 22 }} />; })}</tr>)}</tbody></table></div></CardBody></Card>) : null}
        {tab === "branches" && data.branches ? (<Card className="overflow-x-auto"><Table><THead><TR><TH>Branch</TH><TH align="right">Orders</TH><TH align="right">Revenue</TH><TH align="right">Avg order</TH><TH align="right">Discounts</TH><TH align="right">Voids</TH></TR></THead>
          <TBody>{data.branches.map((r) => <TR key={r.branchId}><TD className="font-medium">{r.name}</TD><TD align="right" className="num">{r.orders}</TD><TD align="right" className="num">{fmt(r.revenueMinor)}</TD><TD align="right" className="num">{fmt(r.aovMinor)}</TD><TD align="right" className="num">{fmt(r.discountMinor)}</TD><TD align="right" className="num">{r.voids}</TD></TR>)}</TBody></Table></Card>) : null}
      </div>
    </>
  );
}
