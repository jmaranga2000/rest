import { notFound } from "next/navigation";
import { getDb } from "@/platform/db";
import { guestMenu, resolveRoom } from "@/modules/guest/service";
import { placeRoomOrderAction, roomStatusAction } from "@/modules/guest/actions";
import { GuestOrderApp } from "@/modules/guest/views/GuestOrderApp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Room service", robots: { index: false, follow: false } };

/** Public page opened by scanning the QR code in a guest room. Ordering needs a checked-in guest and their stay code. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const s = await resolveRoom(db, token);
  if (!s.ok) notFound();
  const menu = await guestMenu(db, s.target);
  return (
    <GuestOrderApp title={`Room ${s.target.label}`} subtitle={`${s.branchName} · room service`} orgName={s.org.name} logoUrl={s.org.logoUrl} currency={s.org.currency} menu={menu}
      orderingOpen={s.orderingOpen} autoSend={s.autoSend} place={placeRoomOrderAction as never} status={roomStatusAction as never} base={{ token }} storageId={`r:${token}`}
      closedMessage={s.target.bookingId ? "Room service is paused. Please call reception." : "Room service opens after you check in at reception. You can browse the menu now."}
      codeField={{ name: "stayCode", label: "Your room-service code", hint: "The number on your check-in slip. It keeps other guests from ordering to your room." }} />
  );
}
