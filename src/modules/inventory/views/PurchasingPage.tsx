import { LuPlus, LuTruck } from "react-icons/lu";
import { StatusBadge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { ConfirmButton } from "@/ui/ActionForm";
import { EmptyState, PageHeader, Tabs } from "@/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatMoney } from "@/platform/money";
import { formatDateTime } from "@/platform/dates";
import { cancelPoAction, orderPoAction } from "../actions";
import { formatQty } from "../units";
import type { PoRow, StockRow, SupplierRow } from "../service";
import { PoDialog, ReceiveDialog, SupplierDialog } from "./InventoryDialogs";

export function PurchasingPage({ tab, orders, suppliers, items, branchId, currency, timezone, can }: { tab: "orders" | "suppliers"; orders: PoRow[]; suppliers: SupplierRow[]; items: StockRow[]; branchId: string; currency: string; timezone: string; can: { manage: boolean; receive: boolean } }) {
  const fmt = (n: number) => formatMoney(n, currency);
  const active = suppliers.filter((s) => s.isActive);
  return (<>
    <PageHeader title="Purchasing" description="Order from suppliers and book deliveries into stock at their real cost."
      actions={can.manage ? (tab === "orders" ? <PoDialog branchId={branchId} suppliers={active} items={items} currency={currency} trigger={<Button icon={<LuPlus className="size-4" />} disabled={!active.length || !items.length}>New order</Button>} />
        : <SupplierDialog trigger={<Button icon={<LuPlus className="size-4" />}>New supplier</Button>} />) : null} />
    <Tabs items={[{ href: "/app/purchasing", label: "Orders", active: tab === "orders", count: orders.length }, { href: "/app/purchasing?tab=suppliers", label: "Suppliers", active: tab === "suppliers", count: suppliers.length }]} />
    <div className="mt-4">{tab === "orders" ? (!orders.length ? <EmptyState icon={<LuTruck className="size-6" />} title="No purchase orders" description={active.length ? "Create one to restock your ingredients." : "Add a supplier first."} /> : (
      <Card className="overflow-x-auto"><Table><THead><TR><TH>Order</TH><TH>Supplier</TH><TH>Lines</TH><TH>Status</TH><TH align="right">Total</TH><TH /></TR></THead>
        <TBody>{orders.map((o) => (<TR key={o.id}><TD><div className="font-medium">{o.number}</div><div className="text-xs text-muted">{formatDateTime(o.createdAt, timezone)}</div></TD><TD>{o.supplierName}</TD>
          <TD className="max-w-xs text-muted">{o.lines.map((l) => `${l.name} ${formatQty(l.qtyMilli, l.unit)}`).join(", ")}</TD><TD><StatusBadge status={o.status} /></TD><TD align="right" className="num">{fmt(o.totalMinor)}</TD>
          <TD align="right"><div className="flex justify-end gap-1">
            {can.manage && o.status === "draft" ? <ConfirmButton action={orderPoAction} input={{ id: o.id }} title={`Mark ${o.number} as sent?`} variant="outline" confirmLabel="Mark sent">Send</ConfirmButton> : null}
            {can.receive && (o.status === "ordered" || o.status === "partial") ? <ReceiveDialog po={o} currency={currency} trigger={<Button size="sm">Receive</Button>} /> : null}
            {can.manage && (o.status === "draft" || o.status === "ordered") ? <ConfirmButton action={cancelPoAction} input={{ id: o.id }} title={`Cancel ${o.number}?`} variant="ghost" danger confirmLabel="Cancel order">Cancel</ConfirmButton> : null}</div></TD></TR>))}</TBody></Table></Card>))
      : (<Card className="overflow-x-auto"><Table><THead><TR><TH>Supplier</TH><TH>Contact</TH><TH>Phone</TH><TH>Status</TH><TH /></TR></THead>
        <TBody>{suppliers.map((s) => (<TR key={s.id}><TD className="font-medium">{s.name}</TD><TD className="text-muted">{s.contact ?? "—"}</TD><TD className="text-muted">{s.phone ?? "—"}</TD><TD><StatusBadge status={s.isActive ? "active" : "disabled"} /></TD>
          <TD align="right">{can.manage ? <SupplierDialog supplier={s} trigger={<Button variant="ghost" size="sm">Edit</Button>} /> : null}</TD></TR>))}</TBody></Table></Card>)}</div></>);
}
