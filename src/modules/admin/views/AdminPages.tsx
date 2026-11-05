import { LuBuilding2, LuMonitorSmartphone, LuPlus, LuShield, LuUserPlus, LuUsers } from "react-icons/lu";
import { Badge, StatusBadge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { ConfirmButton } from "@/ui/ActionForm";
import { EmptyState, PageHeader } from "@/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatDateTime } from "@/platform/dates";
import { deleteAreaAction, deleteRoleAction, removeTableAction, revokeTerminalAction, staffStatusAction } from "../actions";
import type { AuditRow, BranchRow, FloorArea, RoleRow, StaffRow, TerminalRow } from "../service";
import { AreaDialog, BranchDialog, InviteDialog, PairDialog, RoleDialog, StaffDialog, TableDialog } from "./AdminDialogs";

type Opt = { id: string; name: string };

export function FloorPage({ branchId, branchName, floor }: { branchId: string; branchName: string; floor: { areas: FloorArea[]; unassigned: FloorArea["tables"] } }) {
  const areas = floor.areas.map((a) => ({ id: a.id, name: a.name }));
  const Tables = ({ tables, areaId }: { tables: FloorArea["tables"]; areaId: string | null }) => (
    <div className="flex flex-wrap gap-2">
      {tables.map((t) => (<div key={t.id} className="group flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-2">
        <TableDialog branchId={branchId} areas={areas} table={t} areaId={areaId} trigger={<button className="text-left"><div className="font-semibold">{t.label}</div><div className="text-xs text-muted">{t.seats} seats</div></button>} />
        <ConfirmButton action={removeTableAction} input={{ id: t.id }} title={`Remove table ${t.label}?`} danger variant="ghost" confirmLabel="Remove">×</ConfirmButton></div>))}
      <TableDialog branchId={branchId} areas={areas} areaId={areaId} trigger={<Button variant="outline" size="sm" icon={<LuPlus className="size-4" />}>Table</Button>} />
    </div>);
  return (<>
    <PageHeader title="Tables & floor" description={`Layout for ${branchName}. Waiters pick from these tables at the POS.`} actions={<AreaDialog branchId={branchId} trigger={<Button icon={<LuPlus className="size-4" />}>New area</Button>} />} />
    <div className="space-y-4">
      {floor.areas.map((a) => (<Card key={a.id}><CardHeader title={a.name} actions={<div className="flex gap-1"><AreaDialog branchId={branchId} area={a} trigger={<Button variant="ghost" size="sm">Rename</Button>} />
        <ConfirmButton action={deleteAreaAction} input={{ id: a.id }} title={`Delete area ${a.name}?`} description="Its tables stay, but become unassigned." danger variant="ghost" confirmLabel="Delete">Delete</ConfirmButton></div>} /><CardBody><Tables tables={a.tables} areaId={a.id} /></CardBody></Card>))}
      <Card><CardHeader title={floor.areas.length ? "Other tables" : "Tables"} /><CardBody><Tables tables={floor.unassigned} areaId={null} /></CardBody></Card>
    </div></>);
}

export function StaffPage({ staff, roles, branches, origin, meId }: { staff: StaffRow[]; roles: Opt[]; branches: Opt[]; origin: string; meId: string }) {
  const bn = (ids: string[]) => ids.map((i) => branches.find((b) => b.id === i)?.name).filter(Boolean).join(", ") || "All / none";
  return (<>
    <PageHeader title="Staff" description="Everyone who can sign in. Give each person the narrowest role that lets them work."
      actions={<div className="flex gap-2"><InviteDialog roles={roles} branches={branches} origin={origin} trigger={<Button variant="outline" icon={<LuUserPlus className="size-4" />}>Invite link</Button>} />
        <StaffDialog roles={roles} branches={branches} trigger={<Button icon={<LuPlus className="size-4" />}>Add staff</Button>} /></div>} />
    <Card className="overflow-x-auto"><Table><THead><TR><TH>Name</TH><TH>Role</TH><TH>Branches</TH><TH>Sign-in</TH><TH>Status</TH><TH /></TR></THead>
      <TBody>{staff.map((s) => (<TR key={s.id} className={s.status === "disabled" ? "opacity-60" : undefined}>
        <TD><div className="font-medium">{s.name}{s.id === meId ? <span className="ml-2 text-xs text-muted">(you)</span> : null}</div><div className="text-xs text-muted">{s.email ?? "PIN only"}</div></TD>
        <TD>{s.roleName}</TD><TD className="max-w-48 truncate text-muted">{bn(s.branchIds)}</TD>
        <TD className="text-muted">{s.lastLoginAt ? formatDateTime(s.lastLoginAt, "Africa/Nairobi") : "Never"}{s.hasPin ? <Badge className="ml-2">PIN</Badge> : null}</TD>
        <TD><StatusBadge status={s.status === "active" ? "active" : "disabled"} /></TD>
        <TD align="right"><div className="flex justify-end gap-1"><StaffDialog staff={s} roles={roles} branches={branches} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
          {s.id !== meId ? <ConfirmButton action={staffStatusAction} input={{ id: s.id, status: s.status === "active" ? "disabled" : "active" }} title={s.status === "active" ? `Disable ${s.name}?` : `Re-enable ${s.name}?`} description={s.status === "active" ? "They are signed out immediately." : undefined} danger={s.status === "active"} variant="ghost" confirmLabel={s.status === "active" ? "Disable" : "Enable"}>{s.status === "active" ? "Disable" : "Enable"}</ConfirmButton> : null}</div></TD></TR>))}</TBody></Table></Card></>);
}

export function RolesPage({ roles }: { roles: RoleRow[] }) {
  return (<>
    <PageHeader title="Roles & permissions" description="Built-in roles are managed for you. Create custom roles for anything else." actions={<RoleDialog trigger={<Button icon={<LuPlus className="size-4" />}>New role</Button>} />} />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{roles.map((r) => (
      <Card key={r.id}><CardBody className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-2 font-semibold"><LuShield className="size-4 text-primary" />{r.name}</div><p className="mt-1 text-sm text-muted">{r.description || "Custom role"}</p></div>{r.isSystem ? <Badge>Built-in</Badge> : null}</div>
        <div className="text-xs text-muted">{r.permissions.length} permissions · {r.userCount} {r.userCount === 1 ? "person" : "people"} · {r.allBranches ? "all branches" : "assigned branches"}</div>
        <div className="mt-auto flex gap-1">{!r.isSystem ? <><RoleDialog role={r} trigger={<Button variant="outline" size="sm">Edit</Button>} />
          <ConfirmButton action={deleteRoleAction} input={{ id: r.id }} title={`Delete ${r.name}?`} danger variant="ghost" confirmLabel="Delete">Delete</ConfirmButton></> : null}</div></CardBody></Card>))}</div></>);
}

export function BranchesPage({ branches }: { branches: BranchRow[] }) {
  return (<>
    <PageHeader title="Branches" description="Each branch has its own menu availability, tables, stock and cash shifts." actions={<BranchDialog trigger={<Button icon={<LuPlus className="size-4" />}>New branch</Button>} />} />
    <Card className="overflow-x-auto"><Table><THead><TR><TH>Branch</TH><TH>Code</TH><TH>Location</TH><TH>Status</TH><TH /></TR></THead>
      <TBody>{branches.map((b) => (<TR key={b.id}><TD className="font-medium"><LuBuilding2 className="mr-2 inline size-4 text-muted" />{b.name}</TD><TD className="num">{b.code}</TD><TD className="text-muted">{[b.address, b.city].filter(Boolean).join(", ") || "—"}</TD>
        <TD><StatusBadge status={b.isActive ? "active" : "disabled"} /></TD><TD align="right"><BranchDialog branch={b} trigger={<Button variant="ghost" size="sm">Edit</Button>} /></TD></TR>))}</TBody></Table></Card></>);
}

export function TerminalsPage({ terminals, branches }: { terminals: TerminalRow[]; branches: Opt[] }) {
  return (<>
    <PageHeader title="Devices" description="Paired tablets and screens. Staff sign in on them with a PIN." actions={<PairDialog branches={branches} trigger={<Button icon={<LuPlus className="size-4" />}>Pair device</Button>} />} />
    {!terminals.length ? <EmptyState icon={<LuMonitorSmartphone className="size-6" />} title="No devices yet" description="Pair a POS tablet or kitchen screen to get started." /> : (
      <Card className="overflow-x-auto"><Table><THead><TR><TH>Device</TH><TH>Branch</TH><TH>Type</TH><TH>Status</TH><TH /></TR></THead>
        <TBody>{terminals.map((t) => (<TR key={t.id}><TD className="font-medium">{t.name}</TD><TD>{t.branchName}</TD><TD>{t.kind === "pos" ? "POS" : "Kitchen display"}</TD>
          <TD>{!t.isActive ? <StatusBadge status="disabled" label="Revoked" /> : t.pairedAt ? <StatusBadge status="active" label="Paired" /> : <StatusBadge status="pending" label="Waiting for code" />}</TD>
          <TD align="right">{t.isActive ? <ConfirmButton action={revokeTerminalAction} input={{ id: t.id }} title={`Revoke ${t.name}?`} description="The device is signed out and must be paired again." danger variant="ghost" confirmLabel="Revoke">Revoke</ConfirmButton> : null}</TD></TR>))}</TBody></Table></Card>)}</>);
}

export function AuditPage({ rows, timezone }: { rows: AuditRow[]; timezone: string }) {
  return (<>
    <PageHeader title="Audit log" description="Who changed what, newest first. Entries cannot be edited." />
    <Card className="overflow-x-auto"><Table><THead><TR><TH>When</TH><TH>Who</TH><TH>Action</TH><TH>Details</TH></TR></THead>
      <TBody>{rows.map((r) => (<TR key={r.id}><TD className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt, timezone)}</TD><TD>{r.actorName ?? "System"}</TD><TD><code className="text-xs">{r.action}</code></TD><TD className="text-muted">{r.summary}</TD></TR>))}</TBody></Table>
      {!rows.length ? <EmptyState icon={<LuUsers className="size-6" />} title="Nothing recorded yet" /> : null}</Card></>);
}
