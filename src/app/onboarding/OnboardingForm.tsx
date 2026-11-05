"use client";
import { ActionForm, Field, SubmitButton } from "@/ui/ActionForm";
import { Card, CardBody } from "@/ui/Card";
import { Input, Switch } from "@/ui/inputs";
import { onboardingAction } from "@/modules/admin/actions";

export function OnboardingForm({ currency, timezone }: { currency: string; timezone: string }) {
  return (
    <ActionForm action={onboardingAction} redirectTo="/app"><Card><CardBody className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Currency" name="currency" hint="ISO code, e.g. KES"><Input id="currency" name="currency" defaultValue={currency} maxLength={3} required /></Field>
        <Field label="Timezone" name="timezone"><Input id="timezone" name="timezone" defaultValue={timezone} required /></Field></div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tax rate %" name="taxRatePercent" hint="16 for Kenyan VAT, 0 if none."><Input id="taxRatePercent" name="taxRatePercent" type="number" step="0.01" min={0} max={100} defaultValue={16} /></Field>
        <Field label="Dining tables" name="tableCount" hint="We'll create T1…Tn."><Input id="tableCount" name="tableCount" type="number" min={0} max={100} defaultValue={8} /></Field></div>
      <Switch name="taxInclusive" label="Menu prices already include tax" defaultChecked />
      <Switch name="sampleMenu" label="Add a small sample menu" hint="Handy for trying the POS. Edit or delete it any time." defaultChecked />
      <SubmitButton className="w-full" size="lg">Finish setup</SubmitButton></CardBody></Card></ActionForm>);
}
