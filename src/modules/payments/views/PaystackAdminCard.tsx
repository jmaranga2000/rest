"use client";
import { LuPlugZap } from "react-icons/lu";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { ActionForm, ConfirmButton, Field, SubmitButton, useRunAction } from "@/ui/ActionForm";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { Input, Switch } from "@/ui/inputs";
import { Alert } from "@/ui/misc";
import { removeGatewayAction, saveGatewayAction, testGatewayAction } from "@/modules/platform-admin/actions";
import type { GatewayView } from "../service";
import { CopyRow } from "./CopyRow";

/** Super-admin console: connect a restaurant's own Paystack account. The secret is stored encrypted and never shown again. */
export function PaystackAdminCard({ orgId, gateway, supported, currency }: { orgId: string; gateway: GatewayView; supported: boolean; currency: string }) {
  const { run, pending } = useRunAction();
  return (
    <Card className="lg:col-span-2"><CardHeader title="Paystack (customer payments)" description="This restaurant's own Paystack account. Owners cannot see or change these keys."
      actions={gateway.configured ? <Badge tone={gateway.enabled ? "success" : "neutral"}>{gateway.enabled ? `On · ${gateway.mode} keys` : "Off"}</Badge> : <Badge>Not connected</Badge>} />
      <CardBody className="space-y-5">
        {!supported ? <Alert tone="warning" title={`${currency} is not supported by Paystack`}>Paystack charges in NGN, GHS, ZAR, KES, USD, XOF, EGP and RWF. Change this business&apos;s currency before enabling.</Alert> : null}
        <ActionForm action={saveGatewayAction} successMessage="Paystack saved"><div className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Public key" name="publicKey" required hint="pk_test_… or pk_live_…"><Input id="publicKey" name="publicKey" defaultValue={gateway.publicKey} autoComplete="off" spellCheck={false} placeholder="pk_live_…" required /></Field>
            <Field label="Secret key" name="secretKey" hint={gateway.configured ? `Saved (${gateway.secretHint}). Leave blank to keep it.` : "sk_test_… or sk_live_…. Stored encrypted; never shown again."}>
              <Input id="secretKey" name="secretKey" type="password" autoComplete="new-password" spellCheck={false} placeholder={gateway.configured ? gateway.secretHint : "sk_live_…"} /></Field>
          </div>
          <Switch name="enabled" label="Accept Paystack payments at this restaurant's till" hint="Adds “Paystack” as a payment method on their POS." defaultChecked={gateway.configured ? gateway.enabled : true} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {gateway.configured ? <>
              <Button variant="outline" icon={<LuPlugZap />} loading={pending} onClick={() => run(testGatewayAction, { orgId }, { success: "Paystack accepted the key.", refresh: false })}>Test connection</Button>
              <ConfirmButton action={removeGatewayAction} input={{ orgId }} variant="ghost" danger title="Disconnect Paystack?" description="The keys are deleted and Paystack is removed from their till. Past payments are unaffected." confirmLabel="Disconnect" successMessage="Paystack disconnected">Disconnect</ConfirmButton>
            </> : null}
            <SubmitButton>{gateway.configured ? "Save Paystack" : "Connect Paystack"}</SubmitButton>
          </div>
        </div></ActionForm>
        <div className="space-y-3 rounded-lg bg-surface-2 p-4 text-sm">
          <p className="font-medium">Give the restaurant these two URLs for their Paystack dashboard (Settings → API Keys &amp; Webhooks)</p>
          <CopyRow label="Callback URL" value={gateway.returnUrl} hint="Where the customer lands after paying." />
          <CopyRow label="Webhook URL" value={gateway.webhookUrl} hint="Unique to this restaurant. Orders are marked paid automatically when Paystack confirms; the cashier's screen also checks every few seconds, so it works even before the webhook is set." />
        </div>
      </CardBody></Card>);
}
