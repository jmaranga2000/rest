import { StatusBadge } from "@/ui/Badge";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { ConfirmButton } from "@/ui/ActionForm";
import { PageHeader } from "@/ui/misc";
import { PrintButton } from "./PrintButton";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatMoney } from "@/platform/money";
import { formatDateTime } from "@/platform/dates";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/platform/tenancy/settings";
import { refundAction, voidItemAction } from "../actions";
import { ITEM_STATUS_LABEL, type OrderView } from "../types";

export function OrderDetail({ order, orgName, branchName, timezone, receiptHeader, receiptFooter, taxLabel, can }: {
  order: OrderView; orgName: string; branchName: string; timezone: string; receiptHeader: string; receiptFooter: string; taxLabel: string; can: { void: boolean; refund: boolean };
}) {
  const fmt = (n: number) => formatMoney(n, order.currency);
  const items = order.items;
  return (
    <>
      <PageHeader back={{ href: "/app/orders", label: "Orders" }} title={<span className="flex items-center gap-3">Order #{order.number} <StatusBadge status={order.status} /></span>}
        description={`Opened ${formatDateTime(order.openedAt, timezone)} by ${order.openedByName ?? "—"}`} actions={<PrintButton />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Items" />
            <Table>
              <THead><TR><TH>Item</TH><TH>Status</TH><TH align="right">Qty</TH><TH align="right">Total</TH><TH /></TR></THead>
              <TBody>{items.map((i) => (
                <TR key={i.id} className={i.status === "void" ? "opacity-60" : undefined}>
                  <TD><div className={i.status === "void" ? "line-through" : "font-medium"}>{i.name}{i.variantName ? ` · ${i.variantName}` : ""}</div>
                    {i.modifiers.length ? <div className="text-xs text-muted">{i.modifiers.map((m) => m.name).join(", ")}</div> : null}
                    {i.voidReason ? <div className="text-xs text-danger">Voided: {i.voidReason}</div> : null}</TD>
                  <TD className="text-muted">{ITEM_STATUS_LABEL[i.status]}</TD><TD align="right" className="num">{i.qty}</TD><TD align="right" className="num">{fmt(i.lineTotalMinor)}</TD>
                  <TD align="right">{can.void && order.status === "open" && i.status !== "void" && i.status !== "held" ? <ConfirmButton action={voidItemAction} input={{ itemId: i.id }} title={`Void ${i.name}?`} reasonLabel="Reason" danger confirmLabel="Void item" variant="ghost">Void</ConfirmButton> : null}</TD>
                </TR>))}</TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Payments" />
            {!order.payments.length ? <CardBody><p className="text-sm text-muted">No payments yet.</p></CardBody> : (
              <Table>
                <THead><TR><TH>When</TH><TH>Method</TH><TH>Reference</TH><TH align="right">Amount</TH><TH /></TR></THead>
                <TBody>{order.payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="text-muted">{formatDateTime(p.createdAt, timezone)}<div className="text-xs">{p.createdByName}</div></TD>
                    <TD>{PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method}{p.refundOfId ? <span className="ml-2 text-xs text-danger">refund{p.reason ? `: ${p.reason}` : ""}</span> : null}</TD>
                    <TD className="text-muted">{p.reference ?? "—"}</TD>
                    <TD align="right" className={`num font-medium ${p.amountMinor < 0 ? "text-danger" : ""}`}>{fmt(p.amountMinor)}</TD>
                    <TD align="right">{can.refund && p.amountMinor > 0 ? <ConfirmButton action={refundAction} input={{ paymentId: p.id, amountMinor: p.amountMinor }} title="Refund this payment?" description="The full amount is refunded. For a partial refund use the refund amount in your reason and ask a manager." reasonLabel="Reason" danger confirmLabel="Refund" variant="ghost">Refund</ConfirmButton> : null}</TD>
                  </TR>))}</TBody>
              </Table>)}
          </Card>
        </div>

        {/* receipt */}
        <Card className="h-fit print:border-0 print:shadow-none">
          <CardBody className="space-y-3 font-mono text-[13px]" >
            <div className="text-center"><div className="text-base font-semibold">{orgName}</div><div className="text-muted">{branchName}</div>{receiptHeader ? <div className="mt-1 whitespace-pre-line text-muted">{receiptHeader}</div> : null}</div>
            <div className="border-y border-dashed border-line py-2 text-muted"><div>Order #{order.number}</div><div>{formatDateTime(order.openedAt, timezone)}</div>{order.tableLabel ? <div>Table {order.tableLabel}</div> : null}</div>
            <ul className="space-y-1">{items.filter((i) => i.status !== "void").map((i) => (<li key={i.id} className="flex justify-between gap-2"><span>{i.qty} × {i.name}</span><span>{fmt(i.lineTotalMinor)}</span></li>))}</ul>
            <div className="space-y-1 border-t border-dashed border-line pt-2">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmt(order.subtotalMinor)}</span></div>
              {order.discountMinor ? <div className="flex justify-between"><span>Discount</span><span>−{fmt(order.discountMinor)}</span></div> : null}
              {order.serviceChargeMinor ? <div className="flex justify-between"><span>Service charge</span><span>{fmt(order.serviceChargeMinor)}</span></div> : null}
              {order.taxMinor ? <div className="flex justify-between"><span>{taxLabel} {order.taxInclusive ? "(incl.)" : ""}</span><span>{fmt(order.taxMinor)}</span></div> : null}
              <div className="flex justify-between text-base font-semibold"><span>TOTAL</span><span>{fmt(order.totalMinor)}</span></div>
              {order.payments.filter((p) => p.amountMinor > 0).map((p) => (<div key={p.id} className="flex justify-between text-muted"><span>{PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method}</span><span>{fmt(p.amountMinor)}</span></div>))}
              {order.payments.some((p) => p.changeMinor > 0) ? <div className="flex justify-between text-muted"><span>Change</span><span>{fmt(order.payments.reduce((a, p) => a + p.changeMinor, 0))}</span></div> : null}
            </div>
            {receiptFooter ? <div className="whitespace-pre-line pt-2 text-center text-muted">{receiptFooter}</div> : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
