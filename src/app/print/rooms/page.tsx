import Link from "next/link";
import { requirePage } from "@/platform/http/request";
import { getRoomsBoard, roomUrl } from "@/modules/rooms/service";
import { QrCard, type CardSize } from "@/modules/guest/views/QrCard";
import { PrintButton } from "../qr/PrintButton";

export const metadata = { title: "Print room QR codes", robots: { index: false } };
export const dynamic = "force-dynamic";
const LAYOUTS: Record<string, { size: CardSize; grid: string; label: string }> = {
  "1": { size: "lg", grid: "grid-cols-1", label: "1 per page (large)" },
  "4": { size: "md", grid: "grid-cols-2 gap-x-[6mm] gap-y-[6mm]", label: "4 per page" },
  "6": { size: "sm", grid: "grid-cols-3 gap-[4mm]", label: "9 per page (small)" },
};
export default async function Page({ searchParams }: { searchParams: Promise<{ layout?: string; room?: string }> }) {
  const ctx = await requirePage({ permission: "rooms.manage", feature: "rooms" });
  const sp = await searchParams;
  const layout = LAYOUTS[sp.layout ?? "4"] ?? LAYOUTS["4"]!;
  const board = await getRoomsBoard(ctx, ctx.activeBranch?.id ?? "");
  const rooms = sp.room ? board.rooms.filter((r) => r.id === sp.room) : board.rooms;
  return (
    <main className="min-h-dvh bg-[#f3f4f6] p-4 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-4xl flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow">
        <Link href="/app/rooms/manage" className="text-sm font-medium text-[#0f766e]">← Back</Link>
        <span className="text-sm text-[#555]">{board.branchName} · {rooms.length} card{rooms.length === 1 ? "" : "s"}</span>
        <div className="ml-auto flex items-center gap-2">
          {Object.entries(LAYOUTS).map(([k, l]) => <Link key={k} href={`/print/rooms?layout=${k}${sp.room ? `&room=${sp.room}` : ""}`} className={`rounded-full px-3 py-1 text-[13px] font-medium ${(sp.layout ?? "4") === k ? "bg-[#0f766e] text-white" : "bg-[#eee] text-[#444]"}`}>{l.label}</Link>)}
          <PrintButton />
        </div>
      </div>
      <div className={`mx-auto grid w-fit justify-center ${layout.grid}`}>
        {rooms.map((r) => <QrCard key={r.id} kind="room" label={r.number} sub="Room service · ask reception for your code" url={roomUrl(r.qrToken)} size={layout.size} orgName={ctx.org.name} logoUrl={ctx.org.logoUrl} accent="#7c3aed" />)}
      </div>
    </main>
  );
}
