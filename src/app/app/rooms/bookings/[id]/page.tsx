import { requirePage } from "@/platform/http/request";
import { getBooking } from "@/modules/rooms/service";
import { BookingDetail } from "@/modules/rooms/views/RoomsPages";
export const metadata = { title: "Booking" };
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage({ anyPermission: ["rooms.view", "bookings.manage"], feature: "rooms" });
  const { booking, folio } = await getBooking(ctx, (await params).id);
  return <BookingDetail booking={booking} folio={folio} currency={ctx.org.currency} canBook={ctx.permissions.has("bookings.manage")} canWaive={ctx.permissions.has("rooms.manage")} />;
}
