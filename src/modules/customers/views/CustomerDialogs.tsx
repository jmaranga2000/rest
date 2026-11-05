"use client";
import type { ReactNode } from "react";
import { Field, FormDialog } from "@/ui/ActionForm";
import { Input, Switch, Textarea } from "@/ui/inputs";
import { MoneyInput } from "@/ui/MoneyInput";
import { Select } from "@/ui/inputs";
import { adjustPointsAction, saveCustomerAction, saveRewardAction } from "../actions";
import type { CustomerRow, Reward } from "../service";

export function CustomerDialog({ customer, trigger }: { customer?: CustomerRow; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={customer ? "Edit customer" : "New customer"} action={saveCustomerAction} successMessage="Customer saved" size="md">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      <Field label="Name" name="name" required><Input id="name" name="name" defaultValue={customer?.name} required autoFocus /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" name="phone" hint="e.g. 0712 345 678"><Input id="phone" name="phone" type="tel" defaultValue={customer?.phone ?? ""} /></Field>
        <Field label="Email" name="email"><Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} /></Field>
      </div>
      <Field label="Notes" name="notes" hint="Allergies, preferences, favourite table…"><Textarea id="notes" name="notes" rows={2} defaultValue={customer?.notes} /></Field>
      <Switch name="isActive" label="Active" hint="Archived customers are hidden from the POS picker." defaultChecked={customer?.isActive ?? true} />
    </FormDialog>
  );
}

export function AdjustPointsDialog({ customerId, trigger }: { customerId: string; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title="Adjust points" description="Use a positive number to add points and a negative number to remove them." action={adjustPointsAction} successMessage="Points adjusted" size="sm">
      <input type="hidden" name="customerId" value={customerId} />
      <Field label="Points" name="points" required><Input id="points" name="points" type="number" step={1} required autoFocus placeholder="e.g. 50 or -20" /></Field>
      <Field label="Reason" name="reason" required hint="Recorded in the ledger and audit log."><Input id="reason" name="reason" required placeholder="Goodwill after a late order" /></Field>
    </FormDialog>
  );
}

export function RewardDialog({ reward, currency, trigger }: { reward?: Reward; currency: string; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={reward ? "Edit reward" : "New reward"} action={saveRewardAction} successMessage="Reward saved" size="md">
      {reward ? <input type="hidden" name="id" value={reward.id} /> : null}
      <Field label="Name" name="name" required><Input id="name" name="name" defaultValue={reward?.name} placeholder="KSh 200 off your bill" required autoFocus /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Points cost" name="pointsCost" required><Input id="pointsCost" name="pointsCost" type="number" min={1} defaultValue={reward?.pointsCost ?? 100} required /></Field>
        <Field label="Type" name="kind"><Select id="kind" name="kind" defaultValue={reward?.kind ?? "amount_off"}><option value="amount_off">Amount off</option><option value="percent_off">Percent off</option></Select></Field>
      </div>
      <Field label="Value" name="value" required hint={reward?.kind === "percent_off" ? "Basis points: 1000 = 10%." : "Amount for “Amount off”; for “Percent off” enter basis points (1000 = 10%)."}>
        {reward?.kind === "percent_off"
          ? <Input id="value" name="value" type="number" min={1} max={10000} defaultValue={reward.value} required />
          : <MoneyInput name="value" currency={currency} defaultMinor={reward?.value} required />}
      </Field>
      <Switch name="isActive" label="Available to redeem" defaultChecked={reward?.isActive ?? true} />
    </FormDialog>
  );
}
