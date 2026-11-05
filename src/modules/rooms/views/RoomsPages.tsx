import Link from "next/link";
import { LuBedDouble, LuPlus, LuPrinter, LuQrCode, LuPencil, LuRefreshCw, LuTrash2 } from "react-icons/lu";
import { Badge, type Tone } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { ConfirmButton } from "@/ui/ActionForm";
import { EmptyState, KeyValue, PageHeader, StatCard, Tabs } from "@/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatMoney } from "@/platform/money";
import { cancelBookingAction, noShowBookingAction, postOrderToRoomAction, regenerateRoomQrAction, removeRoomAction, removeRoomTypeAction, setRoomStatusAction } from "../actions";
import { roomUrl, type BookingDoc, type BookingRow, type Folio, type RoomsBoard } from "../service";
import { CheckInButton, CheckOutDialog, PaymentDialog, StayCodeButton } from "./BookingForms";
import { RoomDialog, RoomTypeDialog } from "./RoomDialogs";

export type RoomsTab = "overview" | "bookings" | "manage";
export function RoomsTabs({ tab }: { tab: RoomsTab }) {
  return <Tabs items={[{ href: "/app/rooms", label: "Overview", active: tab === "overview" }, { href: "/app/rooms/bookings", label: "Bookings", active: tab === "bookings" }, { href: "/app/rooms/manage", label: "Rooms & rates", active: tab === "manage" }]} />;
}
const OCC: Record<string, { label: string; tone: Tone }> = { occupied: { label: "Occupied", tone: "info" }, arriving: { label: "Arriving today", tone: "warning" }, departing: { label: "Departing today", tone: "warning" }, vacant: { label: "Vacant", tone: "success" } };
const BK: Record<string, Tone> = { reserved: "info", checked_in: "success", checked_out: "neutral", cancelled: "danger", no_show: "danger" };
const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function RoomsOverview({ board, can }: { board: RoomsBoard; can: { book: boolean; manage: boolean } }) {
  const s = board.stats;
  const cells = board.rooms;
  return (
    <>
      <PageHeader title="Rooms" description={`${board.branchName} · today ${board.today}`} actions={can.book ? <Button href="/app/rooms/bookings/new" icon={<LuPlus className="size-4" />}>New booking</Button> : null} />
      <RoomsTabs tab="overview" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Rooms" value={s.total} /><StatCard label="Occupied" value={s.occupied} hint={s.total ? `${Math.round((s.occupied / s.total) * 100)}% occupancy` : undefined} />
        <StatCard label="Arriving today" value={s.arriving} /><StatCard label="Departing today" value={s.departing} /><StatCard label="Cleaning / out of service" value={`${s.cleaning} / ${s.maintenance}`} />
      </div>
      {cells.length === 0 ? <Card><EmptyState icon={<LuBedDouble />} title="No rooms yet" description="Create a room type and add your rooms to start taking bookings." action={can.manage ? <Button href="/app/rooms/manage">Set up rooms</Button> : undefined} /></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cells.map((r) => {
            const o = OCC[r.occupancy]!;
            return (
              <Card key={r.id}><CardBody className="space-y-2">
                <div className="flex items-start justify-between"><div><p className="whitespace-nowrap text-lg font-semibold">Room {r.number}</p><p className="text-xs text-muted">{r.typeName}{r.floor ? ` · floor ${r.floor}` : ""}</p></div><Badge tone={o.tone} dot>{o.label}</Badge></div>
                {r.status !== "ready" ? <Badge tone="warning">{r.status === "cleaning" ? "Needs cleaning" : "Out of service"}</Badge> : null}
                {r.current ? <p className="text-sm"><Link className="font-medium text-primary" href={`/app/rooms/bookings/${r.current.id}`}>{r.current.guestName}</Link><span className="text-muted"> · until {r.current.checkOut}</span></p> : null}
                {r.next ? <p className="text-xs text-muted">Next: <Link className="text-primary" href={`/app/rooms/bookings/${r.next.id}`}>{r.next.guestName}</Link> from {r.next.checkIn}</p> : null}
                {r.status === "cleaning" && (can.book || can.manage) ? <ConfirmButton action={setRoomStatusAction} input={{ id: r.id, status: "ready" }} title={`Room ${r.number} is clean?`} confirmLabel="Mark ready" successMessage="Room ready">Mark clean</ConfirmButton> : null}
              </CardBody></Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export function BookingsList({ rows, filter, currency, can }: { rows: BookingRow[]; filter: string; currency: string; can: { book: boolean } }) {
  const f = (k: string, l: string) => ({ href: `/app/rooms/bookings?filter=${k}`, label: l, active: filter === k });
  return (
    <>
      <PageHeader title="Rooms" description="Reservations, guests in house and past stays." actions={can.book ? <Button href="/app/rooms/bookings/new" icon={<LuPlus className="size-4" />}>New booking</Button> : null} />
      <RoomsTabs tab="bookings" />
      <div className="mb-4 flex gap-1.5">{[f("upcoming", "Upcoming"), f("in_house", "In house"), f("past", "Past"), f("all", "All")].map((t) => <Link key={t.href} href={t.href} className={`rounded-full px-3 py-1 text-[13px] font-medium ${t.active ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-fg"}`}>{t.label}</Link>)}</div>
      <Card>{rows.length === 0 ? <EmptyState icon={<LuBedDouble />} title="No bookings here" /> : (
        <Table><THead><TR><TH>Booking</TH><TH>Guest</TH><TH>Room</TH><TH>Stay</TH><TH align="right">Room charge</TH><TH>Status</TH></TR></THead>
          <TBody>{rows.map((b) => (
            <TR key={b.id}><TD><Link className="font-medium text-primary" href={`/app/rooms/bookings/${b.id}`}>{b.number}</Link></TD><TD>{b.guestName}</TD><TD>{b.roomNumber} <span className="text-muted">· {b.roomTypeName}</span></TD>
              <TD>{b.checkIn} → {b.checkOut} <span className="text-muted">({b.nights}n)</span></TD><TD align="right">{formatMoney(b.roomTotalMinor, currency)}</TD><TD><Badge tone={BK[b.status] ?? "neutral"} dot>{label(b.status)}</Badge></TD></TR>
          ))}</TBody></Table>)}</Card>
    </>
  );
}

export function BookingDetail({ booking: b, folio, currency, canBook, canWaive }: { booking: BookingDoc; folio: Folio; currency: string; canBook: boolean; canWaive: boolean }) {
  const fmt = (n: number) => formatMoney(n, currency);
  return (
    <>
      <PageHeader back={{ href: "/app/rooms/bookings", label: "Bookings" }} title={`${b.number} · ${b.guestName}`} description={`Room ${b.roomNumber} · ${b.roomTypeName} · ${b.checkIn} → ${b.checkOut} (${b.nights} night${b.nights === 1 ? "" : "s"})`}
        actions={<Badge tone={BK[b.status] ?? "neutral"} dot>{label(b.status)}</Badge>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card><CardHeader title="Folio" description="Everything this guest owes." />
            <Table><THead><TR><TH>Charge</TH><TH align="right">Amount</TH></TR></THead><TBody>
              <TR><TD>Room · {b.nights} × {fmt(Number(b.rateMinor))}</TD><TD align="right">{fmt(folio.roomChargesMinor)}</TD></TR>
              {folio.orders.map((o) => (<TR key={o.id}><TD><div className="font-medium">Room service #{o.number}</div><div className="text-xs text-muted">{o.items}</div>
                {o.status === "open" && canBook ? <div className="mt-1"><ConfirmButton action={postOrderToRoomAction} input={{ orderId: o.id }} title="Post to room?" description="Closes the order and adds it to the folio." confirmLabel="Post" successMessage="Posted to room">Post to room</ConfirmButton></div> : <div className="text-xs text-success">{o.status === "closed" ? "Posted" : ""}</div>}</TD><TD align="right">{fmt(o.totalMinor)}</TD></TR>))}
              <TR><TD className="font-semibold">Total charges</TD><TD align="right" className="font-semibold">{fmt(folio.chargesMinor)}</TD></TR>
              {folio.payments.map((p) => (<TR key={p.id}><TD className="text-muted">Payment · {label(p.method)}{p.reference ? ` (${p.reference})` : ""} · {p.at.slice(0, 10)}</TD><TD align="right" className="text-success">−{fmt(Number(p.amountMinor))}</TD></TR>))}
              {folio.waivedMinor > 0 ? <TR><TD className="text-muted">Waived{b.waiveReason ? ` · ${b.waiveReason}` : ""}</TD><TD align="right">−{fmt(folio.waivedMinor)}</TD></TR> : null}
              <TR><TD className="font-semibold">Balance due</TD><TD align="right" className={`text-base font-semibold ${folio.balanceMinor > 0 ? "text-danger" : "text-success"}`}>{fmt(folio.balanceMinor)}</TD></TR>
            </TBody></Table>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card><CardHeader title="Guest" /><CardBody><KeyValue items={[{ label: "Name", value: b.guestName }, { label: "Phone", value: b.guestPhone ?? "—" }, { label: "Email", value: b.guestEmail ?? "—" }, { label: "Adults", value: b.adults }, { label: "Notes", value: b.notes ?? "—" }]} /></CardBody></Card>
          {canBook ? (
            <Card><CardHeader title="Actions" /><CardBody className="flex flex-wrap items-start gap-2">
              {b.status === "reserved" ? <><CheckInButton bookingId={b.id} roomUrl={roomUrlFor(b)} /><ConfirmButton action={cancelBookingAction} input={{ id: b.id }} title="Cancel this booking?" confirmLabel="Cancel booking" danger successMessage="Booking cancelled">Cancel</ConfirmButton><ConfirmButton action={noShowBookingAction} input={{ id: b.id }} title="Mark as no-show?" confirmLabel="No-show" successMessage="Marked no-show">No-show</ConfirmButton></> : null}
              {b.status === "checked_in" ? <><CheckOutDialog bookingId={b.id} balanceMinor={folio.balanceMinor} canWaive={canWaive} trigger={<Button>Check out</Button>} /><StayCodeButton bookingId={b.id} /></> : null}
              {b.status === "reserved" || b.status === "checked_in" || b.status === "checked_out" ? <PaymentDialog bookingId={b.id} currency={currency} balanceMinor={folio.balanceMinor} trigger={<Button variant="outline">Take payment</Button>} /> : null}
            </CardBody></Card>
          ) : null}
          {b.status === "checked_in" && b.stayCode ? <Card><CardHeader title="Room-service code" description="Guest enters this after scanning the room QR." /><CardBody><p className="num text-3xl font-bold tracking-[0.3em]">{b.stayCode}</p></CardBody></Card> : null}
        </aside>
      </div>
    </>
  );
}
const roomUrlFor = (b: BookingDoc): string => `Room ${b.roomNumber} QR (print from Rooms & rates)`;

export function ManageRooms({ board, currency, can }: { board: RoomsBoard; currency: string; can: { manage: boolean } }) {
  const types = board.types;
  return (
    <>
      <PageHeader title="Rooms" description="Room types, rates and the QR code inside each room." actions={can.manage && board.rooms.length ? <Button href="/print/rooms?layout=4" icon={<LuPrinter className="size-4" />}>Print room QR codes</Button> : null} />
      <RoomsTabs tab="manage" />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card><CardHeader title="Room types" actions={can.manage ? <RoomTypeDialog currency={currency} trigger={<Button size="sm" icon={<LuPlus className="size-4" />}>New type</Button>} /> : null} />
          {types.length === 0 ? <EmptyState icon={<LuBedDouble />} title="No room types" description="Start with e.g. Standard, Deluxe, Suite." /> : (
            <ul className="divide-y divide-line">{types.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><p className="font-medium">{t.name}</p><p className="text-xs text-muted">{formatMoney(Number(t.baseRateMinor), currency)} / night · sleeps {t.capacity}{t.amenities.length ? ` · ${t.amenities.join(", ")}` : ""}</p></div>
                {can.manage ? <><RoomTypeDialog type={{ id: t.id, name: t.name, description: t.description, baseRateMinor: Number(t.baseRateMinor), capacity: Number(t.capacity), amenities: t.amenities }} currency={currency} trigger={<Button variant="ghost" size="sm" icon={<LuPencil className="size-3.5" />}>Edit</Button>} />
                  <ConfirmButton action={removeRoomTypeAction} input={{ id: t.id }} title={`Remove ${t.name}?`} confirmLabel="Remove" danger variant="ghost" icon={<LuTrash2 className="size-3.5" />} successMessage="Room type removed">Remove</ConfirmButton></> : null}</li>))}</ul>)}
        </Card>
        <Card><CardHeader title="Rooms" actions={can.manage && types.length ? <RoomDialog branchId={board.branchId} types={types.map((t) => ({ id: t.id, name: t.name }))} trigger={<Button size="sm" icon={<LuPlus className="size-4" />}>New room</Button>} /> : null} />
          {board.rooms.length === 0 ? <EmptyState icon={<LuBedDouble />} title="No rooms" description={types.length ? "Add your rooms; each gets its own QR code." : "Create a room type first."} /> : (
            <Table><THead><TR><TH>Room</TH><TH>Type</TH><TH>Status</TH><TH>Room QR</TH><TH /></TR></THead><TBody>{board.rooms.map((r) => (
              <TR key={r.id}><TD className="font-medium">{r.number}{r.floor ? <span className="text-muted"> · fl {r.floor}</span> : null}</TD><TD>{r.typeName}</TD><TD><Badge tone={r.status === "ready" ? "success" : "warning"}>{label(r.status)}</Badge></TD>
                <TD><Link href={roomUrl(r.qrToken)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[13px] text-primary"><LuQrCode className="size-3.5" />Preview</Link> · <Link href={`/print/rooms?layout=1&room=${r.id}`} className="text-[13px] text-primary">Print</Link></TD>
                <TD align="right">{can.manage ? <div className="flex justify-end gap-1">
                  <RoomDialog room={{ id: r.id, number: r.number, floor: r.floor, roomTypeId: types.find((t) => t.name === r.typeName)?.id ?? "", status: r.status }} branchId={board.branchId} types={types.map((t) => ({ id: t.id, name: t.name }))} trigger={<Button variant="ghost" size="sm" icon={<LuPencil className="size-3.5" />}>Edit</Button>} />
                  <ConfirmButton action={regenerateRoomQrAction} input={{ id: r.id }} title={`New QR code for room ${r.number}?`} description="The printed code stops working immediately." confirmLabel="Regenerate" danger variant="ghost" icon={<LuRefreshCw className="size-3.5" />} successMessage="New QR code created">New QR</ConfirmButton>
                  <ConfirmButton action={removeRoomAction} input={{ id: r.id }} title={`Remove room ${r.number}?`} confirmLabel="Remove" danger variant="ghost" icon={<LuTrash2 className="size-3.5" />} successMessage="Room removed">Remove</ConfirmButton></div> : null}</TD></TR>))}</TBody></Table>)}
        </Card>
      </div>
    </>
  );
}
