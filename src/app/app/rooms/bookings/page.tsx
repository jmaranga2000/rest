import { requirePage } from "@/platform/http/request";
import { listBookings } from "@/modules/rooms/service";
import { BookingsList } from "@/modules/rooms/views/RoomsPages";
export const metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const ctx = await requirePage({ anyPermission: ["rooms.view", "bookings.manage"], feature: "rooms" });
  const f = (["upcoming", "in_house", "past", "all"].includes((await searchParams).filter ?? "") ? (await searchParams).filter : "upcoming") as "upcoming" | "in_house" | "past" | "all";
  return <BookingsList rows={await listBookings(ctx, ctx.activeBranch?.id ?? "", f)} filter={f} currency={ctx.org.currency} can={{ book: ctx.permissions.has("bookings.manage") }} />;
}
