"use client";
import { Honeypot } from "@/ui/Honeypot";
import { ActionForm, Field, SubmitButton } from "@/ui/ActionForm";
import { Input } from "@/ui/inputs";
import { registerAction } from "@/modules/identity/actions";

export function RegisterForm() {
  return (
    <ActionForm action={registerAction} redirectTo={(d) => (d as { redirectTo: string }).redirectTo} className="space-y-4"><Honeypot />
      <Field label="Restaurant name" name="businessName"><Input id="businessName" name="businessName" autoComplete="organization" required placeholder="Mama Oliech Kitchen" /></Field>
      <Field label="Your name" name="ownerName"><Input id="ownerName" name="ownerName" autoComplete="name" required /></Field>
      <Field label="Work email" name="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Password" name="password" hint="At least 10 characters."><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
      <SubmitButton className="w-full" size="lg">Create workspace</SubmitButton>
    </ActionForm>
  );
}
