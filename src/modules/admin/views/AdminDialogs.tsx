"use client";
import { useState, type ReactNode } from "react";
import { Field, FormDialog } from "@/ui/ActionForm";
import { Checkbox, Input, Select, Switch, Textarea } from "@/ui/inputs";
import { PERMISSION_GROUPS } from "@/platform/rbac/permissions";
import { saveAreaAction, saveBranchAction, saveRoleAction, saveStaffAction, saveTableAction, inviteAction, pairTerminalAction } from "../actions";
import type { BranchRow, FloorArea, RoleRow, StaffRow } from "../service";
import { useReveal } from "./Reveal";

type Opt = { id: string; name: string };

export function AreaDialog({ branchId, area, trigger }: { branchId: string; area?: { id: string; name: string }; trigger: ReactNode }) {
  return (<FormDialog trigger={trigger} title={area ? "Rename area" : "New area"} size="sm" action={saveAreaAction} successMessage="Area saved">
    <input type="hidden" name="branchId" value={branchId} />{area ? <input type="hidden" name="id" value={area.id} /> : null}
    <Field label="Name" name="name" required><Input id="name" name="name" defaultValue={area?.name} placeholder="Patio" required autoFocus /></Field></FormDialog>);
}
export function TableDialog({ branchId, areas, table, areaId, trigger }: { branchId: string; areas: Opt[]; table?: FloorArea["tables"][number]; areaId?: string | null; trigger: ReactNode }) {
  return (<FormDialog trigger={trigger} title={table ? "Edit table" : "New table"} size="sm" action={saveTableAction} successMessage="Table saved">
    <input type="hidden" name="branchId" value={branchId} />{table ? <input type="hidden" name="id" value={table.id} /> : null}
    <div className="grid grid-cols-2 gap-4">
      <Field label="Label" name="label" required><Input id="label" name="label" defaultValue={table?.label} placeholder="T1" required autoFocus /></Field>
      <Field label="Seats" name="seats" required><Input id="seats" name="seats" type="number" min={1} max={100} defaultValue={table?.seats ?? 4} required /></Field></div>
    <Field label="Area" name="areaId"><Select id="areaId" name="areaId" defaultValue={areaId ?? ""}><option value="">No area</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field></FormDialog>);
}

function BranchPicker({ branches, selected }: { branches: Opt[]; selected: string[] }) {
  return (<Field label="Branches" name="branchIds" hint="Roles that cover all branches ignore this.">
    <div className="grid gap-1 sm:grid-cols-2">{branches.map((b) => <Checkbox key={b.id} name="branchIds" value={b.id} label={b.name} defaultChecked={selected.includes(b.id)} />)}</div></Field>);
}

export function StaffDialog({ staff, roles, branches, trigger }: { staff?: StaffRow; roles: Opt[]; branches: Opt[]; trigger: ReactNode }) {
  return (<FormDialog trigger={trigger} title={staff ? `Edit ${staff.name}` : "Add staff"} size="md" action={saveStaffAction} successMessage="Saved">
    {staff ? <input type="hidden" name="id" value={staff.id} /> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" name="name" required><Input id="name" name="name" defaultValue={staff?.name} required autoFocus /></Field>
      <Field label="Role" name="roleId" required><Select id="roleId" name="roleId" defaultValue={staff?.roleId}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
      <Field label="Email" name="email" hint="For back-office sign-in."><Input id="email" name="email" type="email" defaultValue={staff?.email ?? ""} /></Field>
      <Field label="Phone" name="phone"><Input id="phone" name="phone" type="tel" defaultValue={staff?.phone ?? ""} /></Field>
      <Field label={staff ? "New temporary password" : "Temporary password"} name="password" hint={staff ? "Leave blank to keep. They must change it at next sign-in." : "At least 10 characters."}><Input id="password" name="password" type="text" autoComplete="off" /></Field>
      <Field label={staff?.hasPin ? "Reset POS PIN" : "POS PIN"} name="pin" hint="4–6 digits, used on paired terminals."><Input id="pin" name="pin" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="off" /></Field>
    </div>
    <BranchPicker branches={branches} selected={staff?.branchIds ?? []} /></FormDialog>);
}

export function InviteDialog({ roles, branches, trigger, origin }: { roles: Opt[]; branches: Opt[]; trigger: ReactNode; origin: string }) {
  const reveal = useReveal<{ token: string; email: string; emailSent: boolean }>((d) => ({
    title: d.emailSent ? "Invitation emailed" : "Invitation link ready",
    description: d.emailSent
      ? `An invitation was sent to ${d.email}. This backup link works once and expires in 7 days.`
      : `Email delivery failed or SMTP is not configured. Share this link with ${d.email}; it works once and expires in 7 days.`,
    value: `${origin}/invite/${d.token}`,
  }));
  return (<>
    <FormDialog trigger={trigger} title="Invite by email link" description="They choose their own password." size="md" action={inviteAction} submitLabel="Create link" onSuccess={reveal.onSuccess}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" name="email" required><Input id="email" name="email" type="email" required autoFocus /></Field>
        <Field label="Role" name="roleId" required><Select id="roleId" name="roleId">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field></div>
      <BranchPicker branches={branches} selected={branches.length === 1 ? [branches[0]!.id] : []} /></FormDialog>
    {reveal.node}</>);
}

export function RoleDialog({ role, trigger }: { role?: RoleRow; trigger: ReactNode }) {
  const [sel] = useState(() => new Set<string>(role?.permissions ?? []));
  return (<FormDialog trigger={trigger} title={role ? `Edit ${role.name}` : "New role"} size="xl" action={saveRoleAction} successMessage="Role saved">
    {role ? <input type="hidden" name="id" value={role.id} /> : null}
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Role name" name="name" required><Input id="name" name="name" defaultValue={role?.name} required autoFocus /></Field>
      <Field label="Description" name="description"><Input id="description" name="description" defaultValue={role?.description} /></Field></div>
    <Switch name="allBranches" label="Access to every branch" hint="Otherwise staff only see branches they are assigned to." defaultChecked={role?.allBranches ?? false} />
    <div className="grid gap-5 sm:grid-cols-2">{PERMISSION_GROUPS.map((g) => (
      <fieldset key={g.id}><legend className="mb-2 text-sm font-semibold">{g.label}</legend><div className="space-y-1.5">{g.permissions.map((p) => (
        <Checkbox key={p.key} name="permissions" value={p.key} label={p.label} hint={p.description} defaultChecked={sel.has(p.key)} />))}</div></fieldset>))}</div></FormDialog>);
}

export function BranchDialog({ branch, trigger }: { branch?: BranchRow; trigger: ReactNode }) {
  return (<FormDialog trigger={trigger} title={branch ? "Edit branch" : "New branch"} size="md" action={saveBranchAction} successMessage="Branch saved">
    {branch ? <input type="hidden" name="id" value={branch.id} /> : null}
    <div className="grid gap-4 sm:grid-cols-3"><Field label="Name" name="name" required className="sm:col-span-2"><Input id="name" name="name" defaultValue={branch?.name} required autoFocus /></Field>
      <Field label="Code" name="code" required><Input id="code" name="code" defaultValue={branch?.code} maxLength={12} placeholder="CBD" required /></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Address" name="address"><Input id="address" name="address" defaultValue={branch?.address ?? ""} /></Field><Field label="City" name="city"><Input id="city" name="city" defaultValue={branch?.city ?? ""} /></Field>
      <Field label="Phone" name="phone"><Input id="phone" name="phone" defaultValue={branch?.phone ?? ""} /></Field><Field label="Timezone" name="timezone" hint="Blank = business timezone."><Input id="timezone" name="timezone" defaultValue={branch?.timezone ?? ""} placeholder="Africa/Nairobi" /></Field></div>
    {branch ? <Switch name="isActive" label="Active" defaultChecked={branch.isActive} /> : null}</FormDialog>);
}

export function PairDialog({ branches, trigger }: { branches: Opt[]; trigger: ReactNode }) {
  const reveal = useReveal<{ code: string }>((d) => ({ title: "Pairing code", description: "Enter this on the device at /pair within 15 minutes.", value: d.code }));
  return (<>
    <FormDialog trigger={trigger} title="Pair a device" description="A tablet or screen that stays signed in to one branch; staff sign in on it with their PIN." size="sm" action={pairTerminalAction} submitLabel="Get code" onSuccess={reveal.onSuccess}>
      <Field label="Device name" name="name" required><Input id="name" name="name" placeholder="Front counter" required autoFocus /></Field>
      <div className="grid grid-cols-2 gap-4"><Field label="Branch" name="branchId"><Select id="branchId" name="branchId">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label="Type" name="kind"><Select id="kind" name="kind"><option value="pos">POS</option><option value="kds">Kitchen display</option></Select></Field></div></FormDialog>
    {reveal.node}</>);
}
