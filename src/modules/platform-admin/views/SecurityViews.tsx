"use client";
import { useState } from "react";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { ActionForm, ConfirmButton, Field, SubmitButton, useRunAction } from "@/ui/ActionForm";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { Input } from "@/ui/inputs";
import { Alert, EmptyState, PageHeader } from "@/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatDateTime } from "@/platform/dates";
import { banIpAction, beginTwoFactorAction, confirmTwoFactorAction, disableTwoFactorAction, unbanIpAction } from "../actions";
import type { SecurityEvent } from "@/platform/security/store";

const TZ = "Africa/Nairobi";
const LABEL: Record<string, string> = {
  honeypot_form: "Honeypot field filled", form_too_fast: "Form submitted too fast", trap_url: "Probed trap URL", canary_login: "Sign-in as bait account", login_failed: "Failed sign-in",
  rate_limited: "Rate limited", bad_signature: "Bad webhook signature", banned_request: "Blocked (banned IP)", totp_failed: "Wrong 2FA code", console_ip_blocked: "Console IP blocked", ban: "IP banned", unban: "IP unbanned",
};
const SERIOUS = new Set(["honeypot_form", "trap_url", "canary_login", "bad_signature", "ban", "totp_failed"]);

function TwoFactor({ enabled, recoveryLeft }: { enabled: boolean; recoveryLeft: number }) {
  const { run, pending } = useRunAction();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  return (
    <Card><CardHeader title="Two-factor sign-in" description="A second code from your phone, required on top of your password." actions={<Badge tone={enabled ? "success" : "warning"}>{enabled ? "On" : "Off"}</Badge>} />
      <CardBody className="space-y-4 text-sm">
        {codes ? (<div className="space-y-3"><Alert tone="warning" title="Save these recovery codes now">Each works once if you lose your phone. They are not shown again.</Alert>
          <ul className="num grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-4 sm:grid-cols-4">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <Button onClick={() => { setCodes(null); location.reload(); }}>I have saved them</Button></div>)
          : enabled ? (<div className="space-y-4"><p className="text-muted">{recoveryLeft} recovery code{recoveryLeft === 1 ? "" : "s"} left. Turning this off needs your password and a current code.</p>
            <ActionForm action={disableTwoFactorAction} successMessage="Two-factor turned off" resetOnSuccess><div className="grid gap-3 sm:grid-cols-3">
              <Field label="Password" name="password"><Input id="d-pw" name="password" type="password" autoComplete="current-password" required /></Field>
              <Field label="Code" name="code"><Input id="d-code" name="code" inputMode="numeric" autoComplete="one-time-code" required /></Field>
              <div className="flex items-end"><SubmitButton variant="outline">Turn off</SubmitButton></div></div></ActionForm></div>)
          : setup ? (<div className="space-y-4">
            <p>In your authenticator app (Google Authenticator, Authy, 1Password…) choose <strong>Enter a setup key</strong> and type this key, account <em>Restaurant OS</em>, time-based:</p>
            <code className="num block break-all rounded-lg bg-surface-2 p-3 text-base tracking-widest">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
            <p className="break-all text-xs text-muted">Or open on your phone: {setup.uri}</p>
            <ActionForm<{ recoveryCodes: string[] }> action={confirmTwoFactorAction} onSuccess={(d) => { setSetup(null); setCodes(d.recoveryCodes); }}><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field label="6-digit code" name="code"><Input id="c-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required /></Field><SubmitButton className="w-full sm:w-auto">Confirm and turn on</SubmitButton></div></ActionForm></div>)
          : (<div className="space-y-3"><p className="text-muted">Strongly recommended for every operator. Without it, a stolen password is enough to reach every restaurant.</p>
            <Button loading={pending} onClick={() => run(beginTwoFactorAction, {}, { refresh: false, onDone: (d) => setSetup(d) })}>Set up two-factor</Button></div>)}
      </CardBody></Card>);
}

export function SecurityPage({ events, bans, twoFactor, allowList }: { events: SecurityEvent[]; bans: { id: string; until: string; reason: string; source: string; active: boolean }[]; twoFactor: { enabled: boolean; recoveryLeft: number }; allowList: boolean }) {
  const active = bans.filter((b) => b.active);
  return (<>
    <PageHeader title="Security" description="Sign-in protection, bans and what the honeypots caught." />
    <div className="space-y-6">
      <section className="grid items-start gap-6 xl:grid-cols-2" aria-label="Security settings">
        <TwoFactor enabled={twoFactor.enabled} recoveryLeft={twoFactor.recoveryLeft} />
        {allowList
          ? <Alert tone="success" title="Operator console IP allow-list is configured">Only the configured IP addresses and CIDR ranges can access this console.</Alert>
          : <Alert tone="info" title="Restrict this console to your office or VPN">Set <code>PLATFORM_ALLOWED_IPS</code> (comma-separated IPs or CIDRs) and everyone else gets a plain 404 here.</Alert>}
      </section>

      <Card>
        <CardHeader title="Banned IPs" description="Blocks sign-in, registration and invites from that address." />
        <CardBody className="space-y-4">
          <ActionForm action={banIpAction} successMessage="IP banned" resetOnSuccess className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
            <Field label="IP address" name="ip" required><Input id="ban-ip" name="ip" placeholder="203.0.113.7" required /></Field>
            <Field label="Duration (hours)" name="hours" required><Input id="ban-hours" name="hours" type="number" min={1} defaultValue={24} required /></Field>
            <SubmitButton variant="outline" className="w-full sm:w-auto">Ban IP</SubmitButton>
          </ActionForm>
          {!active.length ? <p className="border-t border-line pt-4 text-sm text-muted">No active IP bans.</p> : (
            <div className="overflow-x-auto border-t border-line pt-2">
              <Table><THead><TR><TH>IP</TH><TH>Reason</TH><TH>Until</TH><TH /></TR></THead><TBody>{active.map((b) => (
                <TR key={b.id}><TD className="num whitespace-nowrap font-medium">{b.id}</TD><TD className="min-w-40">{b.reason}<div className="text-xs text-muted">{b.source}</div></TD><TD className="whitespace-nowrap text-muted">{formatDateTime(b.until, TZ)}</TD>
                  <TD align="right"><ConfirmButton action={unbanIpAction} input={{ ip: b.id }} title={`Lift ban on ${b.id}?`} variant="outline" confirmLabel="Lift ban">Lift</ConfirmButton></TD></TR>))}</TBody></Table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recent security events" description="Latest suspicious activity and sign-in protection events." />
        {!events.length ? <CardBody><EmptyState title="Nothing suspicious yet" /></CardBody> : (
          <div className="overflow-x-auto">
            <Table><THead><TR><TH>When</TH><TH>Event</TH><TH>IP</TH><TH>Detail</TH></TR></THead><TBody>{events.map((e) => (
              <TR key={e.id}><TD className="whitespace-nowrap text-muted">{formatDateTime(e.createdAt, TZ)}</TD><TD><Badge tone={SERIOUS.has(e.type) ? "danger" : "neutral"}>{LABEL[e.type] ?? e.type}</Badge></TD><TD className="num whitespace-nowrap">{e.ip ?? "—"}</TD><TD className="max-w-xs truncate text-muted" title={[e.path, e.detail, e.userAgent].filter(Boolean).join(" · ")}>{[e.path, e.detail].filter(Boolean).join(" · ")}</TD></TR>))}</TBody></Table>
          </div>
        )}
      </Card>
    </div></>);
}
