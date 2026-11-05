import Link from "next/link";
import { requirePage } from "@/platform/http/request";
import { getQrBoard } from "@/modules/guest/qr-board";
import { QrCard, type CardSize } from "@/modules/guest/views/QrCard";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Print QR codes", robots: { index: false } };
export const dynamic = "force-dynamic";

const LAYOUTS: Record<string, { size: CardSize; grid: string; label: string }> = {
  "1": { size: "lg", grid: "grid-cols-1", label: "1 per page (large)" },
  "4": { size: "md", grid: "grid-cols-2 gap-x-[6mm] gap-y-[6mm]", label: "4 per page" },
  "6": { size: "sm", grid: "grid-cols-3 gap-[4mm]", label: "9 per page (small)" },
};

/** Print view, deliberately outside the app shell so only the cards are on the page. */
export default async function Page({ searchParams }: { searchParams: Promise<{ layout?: string; table?: string }> }) {
  const ctx = await requirePage({ anyPermission: ["menu.manage", "menu.view"] });
  const sp = await searchParams;
  const layout = LAYOUTS[sp.layout ?? "4"] ?? LAYOUTS["4"]!;
  const board = await getQrBoard(ctx, ctx.activeBranch?.id ?? "");
  const tables = sp.table ? board.tables.filter((t) => t.id === sp.table) : board.tables;
  const q = (l: string) => `/print/qr?layout=${l}${sp.table ? `&table=${sp.table}` : ""}`;
  return (
    <main className="min-h-dvh bg-[#f3f4f6] p-4 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-4xl flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow">
        <Link href="/app/menu/qr" className="text-sm font-medium text-[#0f766e]">← Back</Link>
        <span className="text-sm text-[#555]">{board.branchName} · {tables.length} card{tables.length === 1 ? "" : "s"}</span>
        <div className="ml-auto flex items-center gap-2">
          {Object.entries(LAYOUTS).map(([k, l]) => <Link key={k} href={q(k)} className={`rounded-full px-3 py-1 text-[13px] font-medium ${(sp.layout ?? "4") === k ? "bg-[#0f766e] text-white" : "bg-[#eee] text-[#444]"}`}>{l.label}</Link>)}
          <PrintButton />
        </div>
      </div>
      <div className={`mx-auto grid w-fit justify-center ${layout.grid}`}>
        {tables.map((t) => <QrCard key={t.id} kind="table" label={t.label} sub={t.seats ? `${t.seats} seats` : undefined} url={t.url} size={layout.size} orgName={ctx.org.name} logoUrl={ctx.org.logoUrl} />)}
      </div>
    </main>
  );
}
