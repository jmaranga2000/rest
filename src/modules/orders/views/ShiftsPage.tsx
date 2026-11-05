import { LuLock, LuPlus, LuWallet } from "react-icons/lu";
import { StatusBadge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { Field, FormDialog } from "@/ui/ActionForm";
import { Input, Select } from "@/ui/inputs";
import { MoneyInput } from "@/ui/MoneyInput";
import { EmptyState, PageHeader, StatCard } from "@/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatMoney } from "@/platform/money";
import { formatDateTime } from "@/platform/dates";
import { cashMovementAction, closeShiftAction, openShiftAction } from "../actions";
import type { ShiftSummary } from "../service";

export function ShiftsPage({ shifts, mine, branchId, currency, timezone, showAll }: { shifts: ShiftSummary[]; mine: ShiftSummary | null; branchId: string; currency: string; timezone: string; showAll: boolean }) {
  const fmt = (n: number) => formatMoney(n, currency);
  return (
    <>
      <PageHeader title="Cash shifts" description="Open a drawer, record pay-ins and pay-outs, then count it at close. Variance is kept for review." />
      {mine ? (
        <Card className="mb-6">
          <CardHeader title="Your open shift" description={`Since ${formatDateTime(mine.openedAt, timezone)}`} actions={<div className="flex gap-2">
            <FormDialog size="sm" title="Cash movement" action={cashMovementAction} successMessage="Recorded" trigger={<Button variant="outline" icon={<LuPlus className="size-4" />}>Pay-in / out</Button>}>
              <input type="hidden" name="shiftId" value={mine.id} />
              <Field label="Type" name="type"><Select name="type" id="type"><option value="pay_out">Pay-out (cash leaves drawer)</option><option value="pay_in">Pay-in (cash added)</option></Select></Field>
              <Field label="Amount" name="amountMinor" required><MoneyInput name="amountMinor" currency={currency} required /></Field>
              <Field label="Reason" name="reason" required><Input id="reason" name="reason" required placeholder="e.g. Ice delivery" /></Field>
            </FormDialog>
            <FormDialog size="sm" title="Close shift" description={`Expected in drawer: ${fmt(mine.expectedCashMinor)}`} action={closeShiftAction} successMessage="Shift closed" submitLabel="Close shift" trigger={<Button icon={<LuLock className="size-4" />}>Close shift</Button>}>
              <input type="hidden" name="shiftId" value={mine.id} />
              <Field label="Cash counted" name="countedCashMinor" required hint="Count the drawer, including the float."><MoneyInput name="countedCashMinor" currency={currency} required /></Field>
              <Field label="Note" name="note"><Input id="note" name="note" /></Field>
            </FormDialog></div>} />
          <CardBody className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Opening float" value={fmt(mine.openingFloatMinor)} />
            <StatCard label="Cash sales" value={fmt(mine.cashSalesMinor - mine.cashRefundsMinor)} hint={`${mine.orderCount} orders`} />
            <StatCard label="Pay-ins / outs" value={`${fmt(mine.payInMinor)} / ${fmt(mine.payOutMinor)}`} />
            <StatCard label="Expected cash" value={fmt(mine.expectedCashMinor)} />
          </CardBody>
        </Card>
      ) : (
        <Card className="mb-6"><CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary"><LuWallet className="size-5" /></span><div><div className="font-medium">No open shift</div><div className="text-sm text-muted">Open one before taking cash at the POS.</div></div></div>
          <FormDialog size="sm" title="Open shift" description="Count the cash already in the drawer." action={openShiftAction} successMessage="Shift opened" submitLabel="Open shift" trigger={<Button>Open shift</Button>}>
            <input type="hidden" name="branchId" value={branchId} />
            <Field label="Opening float" name="openingFloatMinor" required><MoneyInput name="openingFloatMinor" currency={currency} defaultMinor={0} required /></Field>
          </FormDialog></CardBody></Card>
      )}
      <Card>
        <CardHeader title={showAll ? "All shifts" : "Your shifts"} />
        {!shifts.length ? <EmptyState title="No shifts yet" /> : (
          <div className="overflow-x-auto"><Table>
            <THead><TR><TH>Cashier</TH><TH>Opened</TH><TH>Status</TH><TH align="right">Expected</TH><TH align="right">Counted</TH><TH align="right">Variance</TH></TR></THead>
            <TBody>{shifts.map((s) => (
              <TR key={s.id}><TD className="font-medium">{s.userName}</TD><TD className="text-muted">{formatDateTime(s.openedAt, timezone)}</TD><TD><StatusBadge status={s.status === "open" ? "open" : "closed"} /></TD>
                <TD align="right" className="num">{fmt(s.expectedCashMinor)}</TD><TD align="right" className="num">{s.countedCashMinor == null ? "—" : fmt(s.countedCashMinor)}</TD>
                <TD align="right" className={`num font-medium ${s.varianceMinor ? (s.varianceMinor < 0 ? "text-danger" : "text-warning") : ""}`}>{s.varianceMinor == null ? "—" : fmt(s.varianceMinor)}</TD></TR>))}</TBody>
          </Table></div>)}
      </Card>
    </>
  );
}
