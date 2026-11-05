import { requirePage } from "@/platform/http/request";
import { getRoomsBoard } from "@/modules/rooms/service";
import { ManageRooms } from "@/modules/rooms/views/RoomsPages";
export const metadata = { title: "Rooms & rates" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const ctx = await requirePage({ anyPermission: ["rooms.view", "rooms.manage"], feature: "rooms" });
  const board = await getRoomsBoard(ctx, ctx.activeBranch?.id ?? "");
  return <ManageRooms board={board} currency={ctx.org.currency} can={{ manage: ctx.permissions.has("rooms.manage") }} />;
}
