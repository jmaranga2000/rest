import Link from "next/link";
import { LuBuilding2, LuInbox } from "react-icons/lu";
import { Badge, StatusBadge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { ConfirmButton, Field, FormDialog } from "@/ui/ActionForm";
import { Input, Select } from "@/ui/inputs";
import { MoneyInput } from "@/ui/MoneyInput";
import { EmptyState, PageHeader, StatCard } from "@/ui/misc";
import { SearchInput } from "@/ui/SearchInput";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatMoney } from "@/platform/money";
import { formatDateTime } from "@/platform/dates";
import { approveRequestAction, changePlanAction, extendTrialAction, reactivateOrgAction, recordPaymentAction, rejectRequestAction, suspendOrgAction } from "../actions";
import type { OrgRow, PlatformStats, RequestRow } from "../service";
import { PaystackAdminCard } from "@/modules/payments/views/PaystackAdminCard";
import { PAYSTACK_CURRENCIES } from "@/platform/paystack/client";
import { PlatformNavigation } from "./PlatformNavigation";

const TZ = "Africa/Nairobi";
export function PlatformDashboard({ stats, orgs, q }: { stats: PlatformStats; orgs: OrgRow[]; q?: string }) {
  const k = (n: number) => formatMoney(n, "KES");
  return (<>
    <PageHeader title="Platform overview" description="Every restaurant on the service." />
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Organisations" value={stats.orgs} hint={`${stats.newThisMonth} new this month`} /><StatCard label="Paying" value={stats.active} /><StatCard label="On trial" value={stats.trialing} /><StatCard label="Suspended" value={stats.suspended} /><StatCard label="MRR (est.)" value={k(stats.mrrMinor)} /></div>
    <div className="mb-4 max-w-sm"><SearchInput placeholder="Search name, email or slug" /></div>
    {!orgs.length ? <EmptyState icon={<LuBuilding2 className="size-6" />} title="No organisations found" /> : (
      <Card className="overflow-x-auto"><Table><THead><TR><TH>Organisation</TH><TH>Plan</TH><TH>Status</TH><TH align="right">Staff</TH><TH align="right">Branches</TH><TH align="right">Orders (30d)</TH><TH>Joined</TH></TR></THead>
        <TBody>{orgs.map((o) => (<TR key={o.id}><TD><Link href={`/platform/orgs/${o.id}`} className="font-medium text-primary hover:underline">{o.name}</Link><div className="text-xs text-muted">{o.ownerEmail}</div></TD><TD>{o.planCode}</TD>
          <TD>{o.status === "suspended" ? <StatusBadge status="suspended" /> : <StatusBadge status={o.subStatus} />}</TD><TD align="right" className="num">{o.userCount}</TD><TD align="right" className="num">{o.branchCount}</TD><TD align="right" className="num">{o.orders30d}</TD><TD className="text-muted">{formatDateTime(o.createdAt, TZ)}</TD></TR>))}</TBody></Table></Card>)}
  </>);
}

export function PlatformOrgDetail({ data, plans, gateway }: { data: Awaited<ReturnType<typeof import("../service").getOrgDetail>>; plans: { code: string; name: string }[]; gateway: import("@/modules/payments/service").GatewayView }) {
  const o = data.org;
  return (<>
    <PageHeader back={{ href: "/platform", label: "Organisations" }} title={<span className="flex items-center gap-3">{o.name}<StatusBadge status={o.status === "suspended" ? "suspended" : o.subStatus} /></span>} description={`${o.slug} · plan ${o.planCode} · joined ${formatDateTime(o.createdAt, TZ)}`}
      actions={<div className="flex flex-wrap gap-2">
        <FormDialog size="sm" title="Record payment" description="Money received outside the app. Extends the subscription one period." action={recordPaymentAction} successMessage="Payment recorded" trigger={<Button>Record payment</Button>}>
          <input type="hidden" name="id" value={o.id} /><Field label="Amount (KES)" name="amountMinor" required><MoneyInput name="amountMinor" currency="KES" required /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Method" name="method"><Select name="method" id="method"><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="cash">Cash</option></Select></Field><Field label="Reference" name="reference"><Input id="reference" name="reference" /></Field></div>
          <Field label="Plan" name="planCode"><Select name="planCode" id="planCode" defaultValue={o.planCode}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field></FormDialog>
        <FormDialog size="sm" title="Extend trial" action={extendTrialAction} successMessage="Trial extended" trigger={<Button variant="outline">Extend trial</Button>}><input type="hidden" name="id" value={o.id} /><Field label="Days" name="days"><Input id="days" name="days" type="number" min={1} max={365} defaultValue={14} /></Field></FormDialog>
        <FormDialog size="sm" title="Change plan" action={changePlanAction} successMessage="Plan changed" trigger={<Button variant="outline">Change plan</Button>}><input type="hidden" name="id" value={o.id} /><Field label="Plan" name="planCode"><Select name="planCode" id="planCode" defaultValue={o.planCode}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field></FormDialog>
        {o.status === "suspended" ? <ConfirmButton action={reactivateOrgAction} input={{ id: o.id }} title={`Reactivate ${o.name}?`} variant="outline" size="md" confirmLabel="Reactivate">Reactivate</ConfirmButton>
          : <ConfirmButton action={suspendOrgAction} input={{ id: o.id }} title={`Suspend ${o.name}?`} description="Everyone is signed out and the workspace is blocked." reasonLabel="Reason" danger variant="outline" size="md" confirmLabel="Suspend">Suspend</ConfirmButton>}</div>} />
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader title="Owners" /><CardBody className="space-y-2 text-sm">{data.owners.map((u) => <div key={u.email ?? u.name} className="flex justify-between"><span>{u.name} <span className="text-muted">{u.email}</span></span><span className="text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt, TZ) : "Never signed in"}</span></div>)}
        <div className="pt-2 text-muted">{o.userCount} staff · {o.branchCount} branches · {o.orders30d} orders in 30 days</div></CardBody></Card>
      <Card><CardHeader title="Payments" />{!data.payments.length ? <CardBody><p className="text-sm text-muted">None recorded.</p></CardBody> : <Table><TBody>{data.payments.map((p) => <TR key={p.id}><TD>{formatDateTime(p.createdAt, TZ)}<div className="text-xs text-muted">{p.method} {p.reference}</div></TD><TD align="right" className="num font-medium">{formatMoney(p.amountMinor, p.currency)}</TD></TR>)}</TBody></Table>}</Card>
      <PaystackAdminCard orgId={o.id} gateway={gateway} currency={data.currency} supported={(PAYSTACK_CURRENCIES as readonly string[]).includes(data.currency)} />
      <Card className="lg:col-span-2"><CardHeader title="Operator activity" /><Table><TBody>{data.audit.map((a) => <TR key={a.id}><TD className="whitespace-nowrap text-muted">{formatDateTime(a.createdAt, TZ)}</TD><TD>{a.adminName}</TD><TD>{a.summary}</TD></TR>)}{!data.audit.length ? <TR><TD className="text-muted">No operator actions yet.</TD></TR> : null}</TBody></Table></Card>
    </div></>);
}

export function PlatformRequests({ requests }: { requests: RequestRow[] }) {
  return (<>
    <PageHeader title="Plan requests" description="Customers asking to change plan." />
    {!requests.length ? <EmptyState icon={<LuInbox className="size-6" />} title="Nothing pending" /> : (
      <Card className="overflow-x-auto"><Table><THead><TR><TH>Organisation</TH><TH>Change</TH><TH>Note</TH><TH>Requested</TH><TH /></TR></THead>
        <TBody>{requests.map((r) => (<TR key={r.id}><TD><Link href={`/platform/orgs/${r.orgId}`} className="font-medium text-primary hover:underline">{r.orgName}</Link></TD><TD>{r.fromPlan} → <Badge tone="primary">{r.toPlan}</Badge></TD><TD className="text-muted">{r.note ?? "—"}</TD><TD className="text-muted">{formatDateTime(r.createdAt, TZ)}</TD>
          <TD align="right"><div className="flex justify-end gap-1"><ConfirmButton action={approveRequestAction} input={{ id: r.id }} title="Approve and switch plan now?" variant="outline" confirmLabel="Approve">Approve</ConfirmButton><ConfirmButton action={rejectRequestAction} input={{ id: r.id }} title="Reject request?" reasonLabel="Note to customer" variant="ghost" danger confirmLabel="Reject">Reject</ConfirmButton></div></TD></TR>))}</TBody></Table></Card>)}</>);
}

export function PlatformShell({ name, children, logout }: { name: string; children: React.ReactNode; logout: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <PlatformNavigation name={name} logout={logout} />
      <main className="min-w-0">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
