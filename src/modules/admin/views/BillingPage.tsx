"use client";
import { LuCheck } from "react-icons/lu";
import { Badge, StatusBadge } from "@/ui/Badge";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { ConfirmButton } from "@/ui/ActionForm";
import { Alert, PageHeader } from "@/ui/misc";
import { formatMoney } from "@/platform/money";
import { formatDateTime } from "@/platform/dates";
import type { PlanDef } from "@/platform/tenancy/plans";
import { startSubscriptionChargeAction } from "@/modules/payments/actions";
import { Button } from "@/ui/Button";
import { useRunAction } from "@/ui/ActionForm";
import { requestPlanAction } from "../actions";

export function BillingPage({ plans, current, status, trialEndsAt, periodEnd, pendingTo, usage, timezone, paystack, paystackResult }: {
  paystack?: boolean; paystackResult?: string | null;
  plans: PlanDef[]; current: string; status: string; trialEndsAt: string | null; periodEnd: string | null; pendingTo: string | null; timezone: string;
  usage: { users: number; branches: number; terminals: number };
}) {
  const plan = plans.find((p) => p.code === current);
  const { run, pending } = useRunAction();
  const payWithPaystack = (planCode: string) => run(startSubscriptionChargeAction, { planCode }, { refresh: false, onDone: (r) => { window.location.href = r.authorizationUrl; } });
  const lim = (n: number | null) => (n === null ? "∞" : n);
  return (<>
    <PageHeader title="Billing & plan" description="Your subscription and what's included." />
    {paystackResult === "success" ? <div className="mb-6"><Alert tone="success" title="Payment received">Thank you! Your subscription is active.</Alert></div> : null}
    {paystackResult === "failed" ? <div className="mb-6"><Alert tone="danger" title="Payment did not go through">You have not been charged. Please try again.</Alert></div> : null}
    {paystackResult === "pending" ? <div className="mb-6"><Alert tone="info" title="Confirming your payment">If you completed the payment, your plan will update within a minute.</Alert></div> : null}
    {paystackResult === "review" ? <div className="mb-6"><Alert tone="warning" title="We received your payment">We are reviewing it and will update your plan shortly.</Alert></div> : null}
    {pendingTo ? <div className="mb-6"><Alert tone="info" title="Plan change requested">We're reviewing your request to move to {plans.find((p) => p.code === pendingTo)?.name ?? pendingTo}. You'll hear from us shortly.</Alert></div> : null}
    <Card className="mb-6"><CardHeader title={`${plan?.name ?? current} plan`} actions={<StatusBadge status={status} />} /><CardBody className="grid gap-4 text-sm sm:grid-cols-4">
      <div><div className="text-muted">Staff accounts</div><div className="num text-lg font-semibold">{usage.users} / {lim(plan?.limits.users ?? null)}</div></div>
      <div><div className="text-muted">Branches</div><div className="num text-lg font-semibold">{usage.branches} / {lim(plan?.limits.branches ?? null)}</div></div>
      <div><div className="text-muted">Devices</div><div className="num text-lg font-semibold">{usage.terminals} / {lim(plan?.limits.terminals ?? null)}</div></div>
      <div><div className="text-muted">{status === "trialing" ? "Trial ends" : "Renews"}</div><div className="text-lg font-semibold">{(status === "trialing" ? trialEndsAt : periodEnd) ? formatDateTime((status === "trialing" ? trialEndsAt : periodEnd)!, timezone) : "—"}</div></div></CardBody></Card>
    <div className="grid gap-4 md:grid-cols-3">{plans.map((p) => (
      <Card key={p.code} className={p.code === current ? "ring-2 ring-primary" : undefined}><CardBody className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{p.name}</h3>{p.code === current ? <Badge tone="primary">Current</Badge> : null}</div>
        <div><span className="num text-3xl font-semibold">{formatMoney(p.priceMinor, p.currency)}</span><span className="text-sm text-muted"> / {p.billingInterval}</span></div>
        <p className="text-sm text-muted">{p.description}</p>
        <ul className="space-y-2 text-sm">{p.highlights.map((h) => <li key={h} className="flex gap-2"><LuCheck className="mt-0.5 size-4 shrink-0 text-success" />{h}</li>)}</ul>
        <div className="mt-auto flex flex-col gap-2">{paystack && p.priceMinor > 0 ? <Button loading={pending} onClick={() => payWithPaystack(p.code)}>{p.code === current ? "Renew with Paystack" : `Pay & switch to ${p.name}`}</Button> : null}{p.code !== current && !pendingTo && !(paystack && p.priceMinor > 0) ? <ConfirmButton action={requestPlanAction} input={{ toPlan: p.code }} title={`Switch to ${p.name}?`} description="We'll confirm the change and invoice you. Nothing changes until then." variant="outline" size="md" confirmLabel="Request change" successMessage="Request sent">Choose {p.name}</ConfirmButton> : null}</div></CardBody></Card>))}</div></>);
}
