"use client";
import { ActionForm, Field, SubmitButton } from "@/ui/ActionForm";
import { Input } from "@/ui/inputs";
import { claimPairingAction } from "@/modules/identity/actions";

export function PairForm() {
  return (
    <ActionForm action={claimPairingAction} redirectTo={(d) => (d as { redirectTo: string }).redirectTo} className="space-y-4">
      <Field label="Pairing code" name="code"><Input id="code" name="code" inputMode="numeric" maxLength={6} className="num text-center text-2xl tracking-[0.5em]" autoFocus required /></Field>
      <SubmitButton className="w-full" size="lg">Pair device</SubmitButton>
    </ActionForm>
  );
}
