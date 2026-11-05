import Link from "next/link";
import { LuReceipt } from "react-icons/lu";
import { EmptyState, PageHeader, Tabs } from "@/ui/misc";
import { SearchInput } from "@/ui/SearchInput";
import { StatusBadge } from "@/ui/Badge";
import { Card } from "@/ui/Card";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatMoney } from "@/platform/money";
import { formatDateTime } from "@/platform/dates";
import type { OrderView } from "../types";

const TYPE: Record<string, string> = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery", pickup: "Pickup" };
export type OrdersTab = "all" | "open" | "closed" | "void";

export function OrdersPage({ orders, tab, q, currency, timezone }: { orders: Omit<OrderView, "items" | "payments">[]; tab: OrdersTab; q?: string; currency: string; timezone: string }) {
  const href = (t: OrdersTab) => `/app/orders${t === "all" ? "" : `?status=${t}`}`;
  return (
    <>
      <PageHeader title="Orders" description="Every order across your branches. Open one to see items, payments and the receipt." />
      <Tabs items={(["all", "open", "closed", "void"] as const).map((t) => ({ href: href(t), label: t === "all" ? "All" : t === "void" ? "Voided" : t[0]!.toUpperCase() + t.slice(1), active: tab === t }))} />
      <div className="my-4 max-w-sm"><SearchInput placeholder="Order number or customer" /></div>
      {!orders.length ? <EmptyState icon={<LuReceipt className="size-6" />} title="No orders found" description={q ? "Try a different search." : "Orders appear here as soon as they are taken at the POS."} /> : (
        <Card className="overflow-x-auto">
          <Table>
            <THead><TR><TH>Order</TH><TH>Type</TH><TH>Customer</TH><TH>Opened</TH><TH>Status</TH><TH align="right">Total</TH></TR></THead>
            <TBody>{orders.map((o) => (
              <TR key={o.id}>
                <TD><Link href={`/app/orders/${o.id}`} className="font-medium text-primary hover:underline">#{o.number}</Link>{o.tableLabel ? <span className="ml-2 text-xs text-muted">Table {o.tableLabel}</span> : null}</TD>
                <TD>{TYPE[o.type] ?? o.type}</TD><TD className="text-muted">{o.customerName ?? "—"}</TD>
                <TD className="text-muted">{formatDateTime(o.openedAt, timezone)}</TD>
                <TD><StatusBadge status={o.status} /></TD>
                <TD align="right" className="num font-medium">{formatMoney(o.totalMinor, currency)}</TD>
              </TR>))}</TBody>
          </Table>
        </Card>)}
    </>
  );
}
