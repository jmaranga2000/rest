import Link from "next/link";
import { LuBanknote, LuCircleCheck, LuReceipt, LuShoppingBag, LuTriangleAlert } from "react-icons/lu";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { Alert, PageHeader, StatCard } from "@/ui/misc";
import { BarChart, Donut, HBarList, LineChart } from "@/ui/charts";
import { LiveRefresh } from "@/ui/LiveRefresh";
import { formatMoney, } from "@/platform/money";
import { PAYMENT_METHOD_LABEL } from "@/platform/tenancy/settings";
import { pctChange, type DashboardData } from "../service";

export function DashboardPage({ data, currency, userName, branchId }: { data: DashboardData; currency: string; userName: string; branchId: string | null }) {
  const fmt = (n: number) => formatMoney(n, currency, { compact: n >= 10_000_000 });
  const { now, before } = data;
  const hourly = data.hourly.map((h, i) => ({ label: `${i}`, value: h.revenueMinor })).slice(6, 24);
  return (
    <>
      <PageHeader title={`Hello, ${userName.split(" ")[0]}`} description={`${data.scope.label} · today vs the same weekday last week`} actions={branchId ? <LiveRefresh branchId={branchId} topics={["orders"]} /> : null} />
      {data.checklist ? (
        <Card className="mb-6"><CardHeader title="Get set up" description="A few steps to go live." /><CardBody>
          <ul className="grid gap-2 sm:grid-cols-2">{data.checklist.map((c) => (
            <li key={c.key}><Link href={c.href} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-sm hover:bg-surface-2">
              <LuCircleCheck className={c.done ? "size-5 text-success" : "size-5 text-subtle"} /><span className={c.done ? "text-muted line-through" : "font-medium"}>{c.label}</span></Link></li>))}</ul></CardBody></Card>) : null}
      {data.lowStock ? <div className="mb-6"><Alert tone="warning" title={`${data.lowStock} item${data.lowStock === 1 ? " is" : "s are"} at or below reorder level`} action={<Link href="/app/inventory?filter=low" className="text-sm font-medium underline">Review stock</Link>} /></div> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales today" value={fmt(now.revenueMinor)} icon={<LuBanknote />} delta={{ pct: pctChange(now.revenueMinor, before.revenueMinor) }} hint="vs last week" />
        <StatCard label="Orders" value={now.orders} icon={<LuReceipt />} delta={{ pct: pctChange(now.orders, before.orders) }} hint="vs last week" />
        <StatCard label="Average order" value={fmt(now.aovMinor)} icon={<LuShoppingBag />} delta={{ pct: pctChange(now.aovMinor, before.aovMinor) }} />
        <StatCard label="Open orders now" value={data.openOrders} icon={<LuTriangleAlert />} hint={now.voidOrders ? `${now.voidOrders} voided today` : undefined} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title="Sales, last 14 days" /><CardBody><LineChart data={data.series.map((d) => ({ label: d.date.slice(5), value: d.revenueMinor }))} format={fmt} /></CardBody></Card>
        <Card><CardHeader title="Payment methods" description="Last 7 days" /><CardBody>
          <Donut segments={data.payments.map((p) => ({ label: PAYMENT_METHOD_LABEL[p.method] ?? p.method, value: p.amountMinor }))} /></CardBody></Card>
        <Card className="lg:col-span-2"><CardHeader title="Today by hour" /><CardBody><BarChart data={hourly} format={fmt} height={180} /></CardBody></Card>
        <Card><CardHeader title="Top items" description="Last 7 days" actions={<Link href="/app/reports?tab=products" className="text-sm text-primary hover:underline">All</Link>} /><CardBody>
          <HBarList items={data.topProducts.map((p) => ({ label: p.name, value: p.revenueMinor, sub: `×${p.qty}` }))} format={fmt} /></CardBody></Card>
      </div>
    </>
  );
}
