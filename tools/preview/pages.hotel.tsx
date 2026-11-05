import { AppShell } from "@/ui/shell/AppShell";
import { ctx, shellActions } from "./fixtures";
import { pic } from "./pic";
import { QrPage } from "@/modules/guest/views/QrPage";
import { QrCard } from "@/modules/guest/views/QrCard";
import { GuestOrderApp } from "@/modules/guest/views/GuestOrderApp";
import { BookingDetail, BookingsList, ManageRooms, RoomsOverview } from "@/modules/rooms/views/RoomsPages";
import type { QrBoard } from "@/modules/guest/qr-board";
import type { RoomsBoard, BookingDoc, Folio } from "@/modules/rooms/service";

const tok = (n: number) => `Zk3p9QwL${String(n).padStart(8, "0")}aB7xT2`;
const board: QrBoard = {
  branchId: "b1", branchName: "Nairobi CBD", settings: { qrOrderingEnabled: true, qrAutoSend: true },
  tables: [["T1", "Main hall"], ["T2", "Main hall"], ["T3", "Main hall"], ["P1", "Patio"], ["P2", "Patio"]].map(([l, a], i) => ({ id: `t${i}`, label: l!, seats: i % 2 ? 2 : 4, area: a!, token: tok(i), url: `https://pos.mamaoliech.co.ke/o/${tok(i)}`, hasOpenOrder: i === 1 })),
};
const menu = {
  categories: [{ id: "c1", name: "Grill" }, { id: "c2", name: "Drinks" }],
  products: [
    { id: "p1", categoryId: "c1", name: "Nyama Choma Platter", description: "Slow-grilled goat ribs with kachumbari and ugali.", imageUrl: pic(1), priceMinor: 120000, variants: [], groups: [] },
    { id: "p2", categoryId: "c1", name: "Chicken Burger", description: "Crispy chicken, house sauce, fries.", imageUrl: pic(2), priceMinor: 85000, variants: [], groups: [{ id: "g1", name: "Extras", minSelect: 0, maxSelect: 2, options: [{ id: "o1", name: "Extra cheese", priceMinor: 5000 }] }] },
    { id: "p3", categoryId: "c2", name: "Fresh Passion Juice", description: "", imageUrl: null, priceMinor: 35000, variants: [{ id: "v1", name: "Regular", priceMinor: 35000, isDefault: true }, { id: "v2", name: "Large", priceMinor: 45000, isDefault: false }], groups: [] },
  ],
};
const noop = (async () => ({ ok: false, error: { message: "preview" } })) as never;
const guest = (title: string, room = false) => <GuestOrderApp title={title} subtitle={room ? "Nairobi CBD · room service" : "Nairobi CBD"} orgName="Mama Oliech Kitchen" logoUrl={null} currency="KES" menu={menu} orderingOpen autoSend place={noop} status={noop} base={{}} storageId="x"
  {...(room ? { codeField: { name: "stayCode", label: "Your room-service code", hint: "The number on your check-in slip." } } : {})} />;

const day = (n: number) => new Date(Date.UTC(2026, 10, 2 + n)).toISOString().slice(0, 10);
const rboard: RoomsBoard = {
  branchId: "b1", branchName: "Nairobi CBD", today: day(0), days: [], bookings: [],
  types: [{ id: "ty1", orgId: "o1", name: "Standard", description: null, baseRateMinor: 450000, capacity: 2, amenities: ["Wi-Fi", "TV"], isActive: true }, { id: "ty2", orgId: "o1", name: "Deluxe suite", description: null, baseRateMinor: 950000, capacity: 3, amenities: ["Wi-Fi", "Balcony"], isActive: true }],
  rooms: [
    { id: "r1", number: "101", floor: "1", typeName: "Standard", status: "ready", qrToken: tok(11), occupancy: "occupied", current: { id: "k1", number: "BK-2026-0007", guestName: "Grace Wanjiku", checkOut: day(2) }, next: null },
    { id: "r2", number: "102", floor: "1", typeName: "Standard", status: "cleaning", qrToken: tok(12), occupancy: "vacant", current: null, next: { id: "k2", number: "BK-2026-0009", guestName: "Peter Otieno", checkIn: day(1) } },
    { id: "r3", number: "201", floor: "2", typeName: "Deluxe suite", status: "ready", qrToken: tok(13), occupancy: "arriving", current: null, next: { id: "k3", number: "BK-2026-0010", guestName: "Amina Yusuf", checkIn: day(0) } },
    { id: "r4", number: "202", floor: "2", typeName: "Deluxe suite", status: "maintenance", qrToken: tok(14), occupancy: "vacant", current: null, next: null },
    { id: "r5", number: "203", floor: "2", typeName: "Deluxe suite", status: "ready", qrToken: tok(15), occupancy: "departing", current: { id: "k4", number: "BK-2026-0006", guestName: "John Kamau", checkOut: day(0) }, next: null },
  ],
  stats: { total: 5, occupied: 2, arriving: 1, departing: 1, cleaning: 1, maintenance: 1 },
};
const bk: BookingDoc = { id: "k1", orgId: "o1", branchId: "b1", number: "BK-2026-0007", roomId: "r1", roomNumber: "101", roomTypeName: "Standard", guestName: "Grace Wanjiku", guestPhone: "+254 712 345 678", guestEmail: "grace@example.com", adults: 2,
  checkIn: day(-1), checkOut: day(2), nights: 3, rateMinor: 450000, roomTotalMinor: 1350000, status: "checked_in", stayCode: "483920", payments: [{ id: "p1", method: "mpesa", amountMinor: 900000, reference: "SKL12AB", at: day(-1) + "T10:00:00Z", by: "Olivia" }],
  waivedMinor: 0, waiveReason: null, notes: "Late arrival, quiet room please.", createdAt: day(-5), checkedInAt: day(-1), checkedOutAt: null, cancelledAt: null };
const folio: Folio = { roomChargesMinor: 1350000, serviceChargesMinor: 205000, chargesMinor: 1555000, paidMinor: 900000, waivedMinor: 0, balanceMinor: 655000, openOrderCount: 1, payments: bk.payments,
  orders: [{ id: "o1", number: "1102-014", status: "open", totalMinor: 205000, openedAt: day(0), items: "1× Nyama Choma Platter, 1× Fresh Passion Juice (Large)" }] };

export const pages = {
  "qr-owner": { path: "/app/menu/qr", el: () => <AppShell ctx={ctx} actions={shellActions}><QrPage board={board} orgName="Mama Oliech Kitchen" logoUrl={null} counts={{ items: 3 }} can={{ manage: true, settings: true }} /></AppShell> },
  "qr-print": { path: "/print/qr", dark: false, el: () => <main className="bg-white p-6"><div className="mx-auto grid w-fit grid-cols-2 gap-6">{board.tables.slice(0, 4).map((t) => <QrCard key={t.id} kind="table" label={t.label} sub={`${t.seats} seats`} url={t.url} orgName="Mama Oliech Kitchen" />)}</div></main> },
  "qr-print-room": { path: "/print/rooms", dark: false, el: () => <main className="bg-white p-6"><div className="mx-auto grid w-fit grid-cols-2 gap-6">{rboard.rooms.slice(0, 2).map((r) => <QrCard key={r.id} kind="room" label={r.number} sub="Room service · ask reception for your code" url={`https://pos.mamaoliech.co.ke/r/${r.qrToken}`} orgName="Mama Oliech Kitchen" accent="#7c3aed" />)}</div></main> },
  "guest-table": { path: "/o/x", width: 390, dark: false, el: () => guest("Table T4") },
  "guest-room": { path: "/r/x", width: 390, dark: false, el: () => guest("Room 101", true) },
  "rooms-overview": { path: "/app/rooms", el: () => <AppShell ctx={ctx} actions={shellActions}><RoomsOverview board={rboard} can={{ book: true, manage: true }} /></AppShell> },
  "rooms-bookings": { path: "/app/rooms/bookings", el: () => <AppShell ctx={ctx} actions={shellActions}><BookingsList filter="in_house" currency="KES" can={{ book: true }} rows={[{ id: "k1", number: "BK-2026-0007", guestName: "Grace Wanjiku", roomNumber: "101", roomTypeName: "Standard", checkIn: day(-1), checkOut: day(2), nights: 3, status: "checked_in", roomTotalMinor: 1350000, paidMinor: 900000 }, { id: "k4", number: "BK-2026-0006", guestName: "John Kamau", roomNumber: "203", roomTypeName: "Deluxe suite", checkIn: day(-3), checkOut: day(0), nights: 3, status: "checked_in", roomTotalMinor: 2850000, paidMinor: 2850000 }]} /></AppShell> },
  "rooms-booking": { path: "/app/rooms/bookings/k1", el: () => <AppShell ctx={ctx} actions={shellActions}><BookingDetail booking={bk} folio={folio} currency="KES" canBook canWaive /></AppShell> },
  "rooms-manage": { path: "/app/rooms/manage", el: () => <AppShell ctx={ctx} actions={shellActions}><ManageRooms board={rboard} currency="KES" can={{ manage: true }} /></AppShell> },
};
