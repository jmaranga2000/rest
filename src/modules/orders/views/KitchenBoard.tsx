"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LuArrowLeft, LuCheck, LuChefHat, LuFlame } from "react-icons/lu";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { cn } from "@/ui/cn";
import { LiveRefresh } from "@/ui/LiveRefresh";
import { ThemeToggle } from "@/ui/ThemeToggle";
import { useRunAction } from "@/ui/ActionForm";
import { bumpOrderAction, itemStatusAction } from "../actions";
import type { KitchenTicket } from "../service";

const TYPE: Record<string, string> = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery", pickup: "Pickup" };

export function KitchenBoard({ branchId, branchName, tickets, stations, station, lateMinutes, canOperate, serverNow }: {
  branchId: string; branchName: string; tickets: KitchenTicket[]; stations: { id: string; name: string }[]; station: string | null; lateMinutes: number; canOperate: boolean; serverNow: string;
}) {
  const { run, pending } = useRunAction();
  // The clock starts from the server's time so a wrong device clock can't skew ticket ages.
  const [skew] = useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.parse(serverNow));
  useEffect(() => { const t = setInterval(() => setNow(Date.now() + skew), 15_000); return () => clearInterval(t); }, [skew]);
  const mins = (iso: string) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <Link href="/app" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label="Back"><LuArrowLeft className="size-5" /></Link>
        <LuChefHat className="size-5 text-primary" /><div className="font-semibold">Kitchen · {branchName}</div>
        <Badge tone="primary">{tickets.length} ticket{tickets.length === 1 ? "" : "s"}</Badge>
        <nav className="ml-4 hidden gap-1.5 sm:flex" aria-label="Stations">
          {[{ id: "", name: "All stations" }, ...stations].map((s) => (
            <Link key={s.id} href={s.id ? `/kitchen?station=${s.id}` : "/kitchen"} className={cn("rounded-full px-3 py-1 text-sm font-medium", (station ?? "") === s.id ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-fg")}>{s.name}</Link>))}
        </nav>
        <div className="ml-auto flex items-center gap-2"><LiveRefresh branchId={branchId} topics={["kitchen"]} /><ThemeToggle /></div>
      </header>

      {!tickets.length ? (
        <div className="grid flex-1 place-items-center text-center"><div><LuCheck className="mx-auto mb-3 size-10 text-success" /><p className="text-lg font-semibold">All caught up</p><p className="text-sm text-muted">New orders appear here the moment they are sent.</p></div></div>
      ) : (
        <div className="grid flex-1 content-start gap-3 overflow-y-auto p-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(17rem, 1fr))" }}>
          {tickets.map((t) => {
            const age = mins(t.sentAt);
            const late = age >= lateMinutes;
            const allReady = t.items.every((i) => i.status === "ready");
            const started = t.items.some((i) => i.status === "preparing");
            return (
              <article key={t.orderId} className={cn("flex flex-col overflow-hidden rounded-xl border bg-surface", late ? "border-danger" : "border-line")}>
                <header className={cn("flex items-center justify-between px-3 py-2", late ? "bg-danger-soft" : "bg-surface-2")}>
                  <div><div className="font-semibold">{t.tableLabel ? `Table ${t.tableLabel}` : TYPE[t.type] ?? t.type}<span className="ml-2 text-xs font-normal text-muted">#{t.number}</span></div>
                    {t.customerName ? <div className="text-xs text-muted">{t.customerName}</div> : null}</div>
                  <div className={cn("num inline-flex items-center gap-1 text-sm font-semibold", late ? "text-danger" : "text-muted")}>{late ? <LuFlame className="size-4" /> : null}{age}m</div>
                </header>
                <ul className="flex-1 divide-y divide-line">
                  {t.items.map((i) => (
                    <li key={i.id} className="flex items-start gap-3 px-3 py-2.5">
                      <span className="num grid size-7 shrink-0 place-items-center rounded-md bg-primary-soft text-sm font-bold text-primary">{i.qty}</span>
                      <div className="min-w-0 flex-1">
                        <div className={cn("text-sm font-medium", i.status === "ready" && "text-muted line-through")}>{i.name}{i.variantName ? ` · ${i.variantName}` : ""}</div>
                        {i.modifiers.length ? <div className="text-xs text-muted">{i.modifiers.join(", ")}</div> : null}
                        {i.note ? <div className="mt-0.5 rounded bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning">{i.note}</div> : null}
                        {i.round > 1 ? <span className="text-[11px] uppercase tracking-wide text-subtle">Round {i.round}</span> : null}
                      </div>
                      {canOperate && i.status !== "ready" ? <button disabled={pending} aria-label={i.status === "sent" ? "Start" : "Mark ready"} onClick={() => run(itemStatusAction, { itemId: i.id, status: i.status === "sent" ? "preparing" : "ready" })}
                        className={cn("shrink-0 rounded-md border px-2 py-1 text-xs font-medium", i.status === "sent" ? "border-line text-muted hover:bg-surface-2" : "border-success text-success hover:bg-success-soft")}>{i.status === "sent" ? "Start" : "Ready"}</button> : null}
                      {i.status === "ready" ? <LuCheck className="mt-1 size-4 shrink-0 text-success" aria-label="Ready" /> : null}
                    </li>))}
                </ul>
                {canOperate ? <footer className="border-t border-line p-2">
                  {allReady ? <Button className="w-full" variant="soft" disabled={pending} onClick={() => run(bumpOrderAction, { orderId: t.orderId, status: "served" })}>Served — clear ticket</Button>
                    : <Button className="w-full" disabled={pending} variant={started ? "primary" : "outline"} onClick={() => run(bumpOrderAction, { orderId: t.orderId, status: started ? "ready" : "preparing" })}>{started ? "All ready" : "Start all"}</Button>}
                </footer> : null}
              </article>);
          })}
        </div>
      )}
    </div>
  );
}
