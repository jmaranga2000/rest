"use client";
import { ActionForm, Field, SubmitButton } from "@/ui/ActionForm";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { Checkbox, Input, Select, Switch, Textarea } from "@/ui/inputs";
import { PageHeader } from "@/ui/misc";
import { ORDER_TYPE_LABEL, ORDER_TYPES, PAYMENT_METHODS, PAYMENT_METHOD_LABEL, type OrgSettings } from "@/platform/tenancy/settings";
import { PaystackStatus } from "@/modules/payments/views/PaystackStatus";
import type { GatewayStatus } from "@/modules/payments/service";
import { saveOrgProfileAction, saveSettingsAction } from "../actions";

export function SettingsPage({ org, settings, gateway }: { org: { name: string; currency: string; timezone: string }; settings: OrgSettings; gateway: GatewayStatus }) {
  return (<>
    <PageHeader title="Settings" description="Business profile, tax, service charge, payments and receipts." />
    <div className="max-w-3xl space-y-6">
      <Card><CardHeader title="Business" />
        <ActionForm action={saveOrgProfileAction} successMessage="Profile saved"><CardBody className="space-y-4">
          <Field label="Business name" name="name" required><Input id="name" name="name" defaultValue={org.name} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Currency" name="currency" hint="ISO code, e.g. KES. Changing it doesn't convert past orders."><Input id="currency" name="currency" defaultValue={org.currency} maxLength={3} required /></Field>
            <Field label="Timezone" name="timezone" required><Input id="timezone" name="timezone" defaultValue={org.timezone} required /></Field></div>
          <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div></CardBody></ActionForm></Card>

      <PaystackStatus gateway={gateway} />

      <ActionForm action={saveSettingsAction} successMessage="Settings saved"><div className="space-y-6">
        <Card><CardHeader title="Tax & service charge" /><CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3"><Field label="Tax label" name="taxLabel"><Input id="taxLabel" name="taxLabel" defaultValue={settings.taxLabel} required /></Field>
            <Field label="Tax rate %" name="taxRatePercent"><Input id="taxRatePercent" name="taxRatePercent" type="number" step="0.01" min={0} max={100} defaultValue={settings.taxRateBp / 100} required /></Field>
            <Field label="Service charge %" name="serviceChargePercent"><Input id="serviceChargePercent" name="serviceChargePercent" type="number" step="0.01" min={0} max={100} defaultValue={settings.serviceChargeBp / 100} /></Field></div>
          <Switch name="taxInclusive" label="Menu prices include tax" hint="Off = tax is added on top at checkout." defaultChecked={settings.taxInclusive} />
          <Switch name="serviceChargeTaxable" label="Tax the service charge" defaultChecked={settings.serviceChargeTaxable} />
          <fieldset><legend className="mb-2 text-[13px] font-medium">Charge service on</legend><div className="flex flex-wrap gap-4">{ORDER_TYPES.map((t) => <Checkbox key={t} name="serviceChargeTypes" value={t} label={ORDER_TYPE_LABEL[t]} defaultChecked={settings.serviceChargeTypes.includes(t)} />)}</div></fieldset></CardBody></Card>
        <Card><CardHeader title="Selling" /><CardBody className="space-y-4">
          <fieldset><legend className="mb-2 text-[13px] font-medium">Order types</legend><div className="flex flex-wrap gap-4">{ORDER_TYPES.map((t) => <Checkbox key={t} name="orderTypes" value={t} label={ORDER_TYPE_LABEL[t]} defaultChecked={settings.orderTypes.includes(t)} />)}</div></fieldset>
          <fieldset><legend className="mb-2 text-[13px] font-medium">Payment methods</legend><div className="flex flex-wrap gap-4">{PAYMENT_METHODS.filter((m) => m !== "paystack" || gateway.enabled).map((m) => <Checkbox key={m} name="paymentMethods" value={m} label={PAYMENT_METHOD_LABEL[m]} defaultChecked={settings.paymentMethods.includes(m)} />)}</div></fieldset>
          <Switch name="requireShiftForCash" label="Require an open cash shift to take cash" defaultChecked={settings.requireShiftForCash} />
          <Switch name="allowNegativeStock" label="Allow stock to go negative" hint="Off blocks sales that would take an ingredient below zero." defaultChecked={settings.allowNegativeStock} />
          <Field label="Flag kitchen tickets older than (minutes)" name="kitchenLateMinutes"><Input id="kitchenLateMinutes" name="kitchenLateMinutes" type="number" min={1} max={240} defaultValue={settings.kitchenLateMinutes} className="max-w-32" /></Field></CardBody></Card>
        <Card><CardHeader title="Receipt" /><CardBody className="space-y-4">
          <Field label="Header" name="receiptHeader" hint="Address, PIN number, phone."><Textarea id="receiptHeader" name="receiptHeader" rows={2} defaultValue={settings.receiptHeader} /></Field>
          <Field label="Footer" name="receiptFooter"><Textarea id="receiptFooter" name="receiptFooter" rows={2} defaultValue={settings.receiptFooter} /></Field>
          <div className="flex justify-end"><SubmitButton>Save settings</SubmitButton></div></CardBody></Card>
      </div></ActionForm>
    </div></>);
}
