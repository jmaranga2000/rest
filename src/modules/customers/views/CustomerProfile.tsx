import Link from "next/link";
import { LuPencil, LuCirclePlus } from "react-icons/lu";
import { Badge, StatusBadge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card, CardHeader } from "@/ui/Card";
import { EmptyState, PageHeader, StatCard } from "@/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatDate, formatDateTime } from "@/platform/dates";
import { formatMoney } from "@/platform/money";
import type { CustomerOrder, CustomerRow, LedgerEntry } from "../service";
import { AdjustPointsDialog, CustomerDialog } from "./CustomerDialogs";

const TYPE_LABEL: Record<LedgerEntry["type"], string> = { earn: "Earned", redeem: "Redeemed", adjust: "Adjustment", reverse: "Reversal" };

export function CustomerProfile({ customer: c, orders, ledger, currency, timezone, loyaltyEnabled, canManage, canAdjust }: {
  customer: CustomerRow; orders: CustomerOrder[]; ledger: LedgerEntry[]; currency: string; timezone: string; loyaltyEnabled: boolean; canManage: boolean; canAdjust: boolean;
}) {
  const fmt = (n: number) => formatMoney(n, currency);
  return (
    <>
      <PageHeader title={<>{c.name}{!c.isActive ? <Badge className="ml-3 align-middle">Archived</Badge> : null}</>} back={{ href: "/app/customers", label: "Customers" }}
        description={[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}
        actions={canManage ? <CustomerDialog customer={c} trigger={<Button variant="outline" icon={<LuPencil className="size-4" />}>Edit</Button>} /> : null} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Visits" value={c.visits} hint={c.lastVisitAt ? `Last ${formatDate(c.lastVisitAt, timezone)}` : "No visits yet"} />
        <StatCard label="Lifetime spend" value={fmt(c.lifetimeSpendMinor)} />
        <StatCard label="Average per visit" value={c.visits ? fmt(Math.round(c.lifetimeSpendMinor / c.visits)) : "—"} />
        {loyaltyEnabled ? <StatCard label="Points balance" value={c.pointsBalance} /> : null}
      </div>
      {c.notes ? <Card className="mt-4 p-4 text-sm"><span className="font-medium">Notes: </span><span className="text-muted">{c.notes}</span></Card> : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent orders" />
          {orders.length === 0 ? <EmptyState title="No orders yet" description="Orders attached to this customer appear here." /> : (
            <Table>
              <THead><TR><TH>Order</TH><TH>Date</TH><TH>Status</TH><TH align="right">Total</TH></TR></THead>
              <TBody>{orders.map((o) => <TR key={o.id}><TD className="font-medium"><Link href={`/app/orders/${o.id}`} className="hover:text-primary">#{o.number}</Link></TD><TD className="text-muted">{o.businessDate}</TD><TD><StatusBadge status={o.status} /></TD><TD align="right">{fmt(o.totalMinor)}</TD></TR>)}</TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Points ledger" actions={canAdjust ? <AdjustPointsDialog customerId={c.id} trigger={<Button variant="outline" size="sm" icon={<LuCirclePlus className="size-4" />}>Adjust</Button>} /> : null} />
          {ledger.length === 0 ? <EmptyState title="No points activity" description="Earned, redeemed and adjusted points are listed here." /> : (
            <Table>
              <THead><TR><TH>When</TH><TH>Type</TH><TH align="right">Points</TH><TH align="right">Balance</TH></TR></THead>
              <TBody>{ledger.map((l) => (
                <TR key={l.id}>
                  <TD className="text-muted">{formatDateTime(l.createdAt, timezone)}<div className="text-xs">{l.note}</div></TD>
                  <TD>{TYPE_LABEL[l.type]}</TD>
                  <TD align="right" className={l.points < 0 ? "text-danger" : l.points > 0 ? "text-success" : ""}>{l.points > 0 ? `+${l.points}` : l.points}</TD>
                  <TD align="right">{l.balanceAfter}</TD>
                </TR>))}</TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
