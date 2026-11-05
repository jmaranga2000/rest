import { requirePage } from "@/platform/http/request";
import { getRoomsBoard } from "@/modules/rooms/service";
import { RoomsOverview } from "@/modules/rooms/views/RoomsPages";
export const metadata = { title: "Rooms" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const ctx = await requirePage({ anyPermission: ["rooms.view", "rooms.manage", "bookings.manage"], feature: "rooms" });
  const board = await getRoomsBoard(ctx, ctx.activeBranch?.id ?? "");
  return <RoomsOverview board={board} can={{ book: ctx.permissions.has("bookings.manage"), manage: ctx.permissions.has("rooms.manage") }} />;
}
