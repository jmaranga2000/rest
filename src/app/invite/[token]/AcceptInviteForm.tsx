"use client";
import { Honeypot } from "@/ui/Honeypot";
import { ActionForm, Field, SubmitButton } from "@/ui/ActionForm";
import { Input } from "@/ui/inputs";
import { acceptInviteAction } from "@/modules/admin/actions";
export function AcceptInviteForm({ token, defaultName }: { token: string; defaultName: string }) {
  return (<ActionForm action={acceptInviteAction} redirectTo="/login" successMessage="Account created — sign in"><Honeypot /><div className="space-y-4">
    <input type="hidden" name="token" value={token} />
    <Field label="Your name" name="name" required><Input id="name" name="name" defaultValue={defaultName} required autoFocus /></Field>
    <Field label="Password" name="password" required hint="At least 10 characters."><Input id="password" name="password" type="password" autoComplete="new-password" required /></Field>
    <SubmitButton className="w-full">Create account</SubmitButton></div></ActionForm>);
}
