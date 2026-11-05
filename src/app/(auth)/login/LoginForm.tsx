"use client";
import Link from "next/link";
import { Honeypot } from "@/ui/Honeypot";
import { ActionForm, Field, SubmitButton } from "@/ui/ActionForm";
import { Input } from "@/ui/inputs";
import { loginAction } from "@/modules/identity/actions";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction} redirectTo={(d) => (d as { redirectTo: string }).redirectTo} className="space-y-4"><Honeypot />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" name="email"><Input id="email" name="email" type="email" autoComplete="email" autoFocus required /></Field>
      <Field label="Password" name="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      <SubmitButton className="w-full" size="lg">Sign in</SubmitButton>
      <p className="text-center text-sm text-muted">On a shared till or kitchen screen? <Link className="font-medium text-primary hover:underline" href="/pin">Use your PIN</Link></p>
    </ActionForm>
  );
}
