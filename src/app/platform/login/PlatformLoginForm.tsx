"use client";
import { Honeypot } from "@/ui/Honeypot";
import { ActionForm, Field, SubmitButton } from "@/ui/ActionForm";
import { Input } from "@/ui/inputs";
import { platformLoginAction } from "@/modules/platform-admin/actions";
export function PlatformLoginForm() {
  return (<ActionForm action={platformLoginAction} redirectTo={(d) => (d as { redirectTo: string }).redirectTo} className="space-y-4"><Honeypot />
    <Field label="Email" name="email"><Input id="email" name="email" type="email" autoFocus required /></Field>
    <Field label="Password" name="password"><Input id="password" name="password" type="password" required /></Field>
    <Field label="Authenticator code" name="code" hint="Only if you turned on two-factor sign-in. A recovery code also works."><Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={20} /></Field>
    <SubmitButton className="w-full" size="lg">Sign in</SubmitButton></ActionForm>);
}
