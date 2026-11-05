import { notFound } from "next/navigation";
import { getDb } from "@/platform/db";
import { guestMenu, resolveTable } from "@/modules/guest/service";
import { guestStatusAction, placeGuestOrderAction } from "@/modules/guest/actions";
import { GuestOrderApp } from "@/modules/guest/views/GuestOrderApp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order from your table", robots: { index: false, follow: false } };

/** Public page opened by scanning a table's QR code. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const s = await resolveTable(db, token);
  if (!s.ok) notFound();
  const menu = await guestMenu(db, s.target);
  return (
    <GuestOrderApp title={`Table ${s.target.label}`} subtitle={s.branchName} orgName={s.org.name} logoUrl={s.org.logoUrl} currency={s.org.currency} menu={menu}
      orderingOpen={s.orderingOpen} autoSend={s.autoSend} place={placeGuestOrderAction as never} status={guestStatusAction as never} base={{ token }} storageId={`t:${token}`} />
  );
}
