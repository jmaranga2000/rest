import Link from "next/link";
import { LuPencil, LuPlus, LuUsers } from "react-icons/lu";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { EmptyState, PageHeader, Pagination } from "@/ui/misc";
import { SearchInput } from "@/ui/SearchInput";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatDate } from "@/platform/dates";
import { formatMoney } from "@/platform/money";
import type { CustomerPage } from "../service";
import { CustomerDialog } from "./CustomerDialogs";

export function CustomersPage({ data, q, currency, timezone, loyaltyEnabled, canManage }: { data: CustomerPage; q?: string; currency: string; timezone: string; loyaltyEnabled: boolean; canManage: boolean }) {
  const hrefFor = (p: number) => `/app/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString()}`;
  return (
    <>
      <PageHeader title="Customers" description="Regulars, their visits and loyalty points." actions={canManage ? <CustomerDialog trigger={<Button icon={<LuPlus className="size-4" />}>New customer</Button>} /> : null} />
      <Card>
        <div className="border-b border-line p-4"><SearchInput placeholder="Search name or phone" /></div>
        {data.rows.length === 0 ? (
          <EmptyState icon={<LuUsers />} title={q ? "No customers match" : "No customers yet"} description={q ? "Try a different name or phone number." : "Add customers here or attach them to an order at the POS."}
            action={canManage && !q ? <CustomerDialog trigger={<Button>Add customer</Button>} /> : undefined} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Customer</TH><TH>Phone</TH><TH align="right">Visits</TH><TH align="right">Lifetime spend</TH>{loyaltyEnabled ? <TH align="right">Points</TH> : null}<TH>Last visit</TH><TH /></TR></THead>
              <TBody>
                {data.rows.map((c) => (
                  <TR key={c.id} className={c.isActive ? "" : "opacity-60"}>
                    <TD><Link href={`/app/customers/${c.id}`} className="font-medium hover:text-primary">{c.name}</Link>{!c.isActive ? <Badge className="ml-2">Archived</Badge> : null}</TD>
                    <TD className="num text-muted">{c.phone ?? "—"}</TD>
                    <TD align="right">{c.visits}</TD>
                    <TD align="right">{formatMoney(c.lifetimeSpendMinor, currency, { hideZeroDecimals: true })}</TD>
                    {loyaltyEnabled ? <TD align="right">{c.pointsBalance}</TD> : null}
                    <TD className="text-muted">{c.lastVisitAt ? formatDate(c.lastVisitAt, timezone) : "—"}</TD>
                    <TD align="right">{canManage ? <CustomerDialog customer={c} trigger={<Button variant="ghost" size="sm" icon={<LuPencil className="size-3.5" />}>Edit</Button>} /> : null}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={data.page} pageCount={data.pageCount} hrefFor={hrefFor} />
          </>
        )}
      </Card>
    </>
  );
}
