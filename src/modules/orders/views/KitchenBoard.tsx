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
      <header className="flex shrink-0 flex-col gap-2 border-b border-line bg-surface px-2 py-2 sm:h-14 sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:py-0">
        <div className="flex min-w-0 items-center gap-2 sm:contents">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-3">
            <Link href="/app" className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label="Back"><LuArrowLeft className="size-5" /></Link>
            <LuChefHat className="size-5 shrink-0 text-primary" />
            <div className="min-w-0 truncate font-semibold">Kitchen · {branchName}</div>
            <Badge tone="primary">{tickets.length} ticket{tickets.length === 1 ? "" : "s"}</Badge>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:order-3 sm:ml-auto"><LiveRefresh branchId={branchId} topics={["kitchen"]} /><ThemeToggle compactOnMobile /></div>
        </div>
        <nav className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto sm:order-2 sm:ml-4 sm:flex-1" aria-label="Stations">
          {[{ id: "", name: "All stations" }, ...stations].map((s) => (
            <Link key={s.id} href={s.id ? `/kitchen?station=${s.id}` : "/kitchen"} aria-current={(station ?? "") === s.id ? "page" : undefined} className={cn("inline-flex min-h-10 shrink-0 items-center rounded-full px-3 text-sm font-medium", (station ?? "") === s.id ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-fg")}>{s.name}</Link>))}
        </nav>
      </header>

      {!tickets.length ? (
        <div className="grid flex-1 place-items-center p-4 text-center"><div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-card"><span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-success-soft"><LuCheck className="size-6 text-success" /></span><p className="text-lg font-semibold">All caught up</p><p className="mt-1 text-sm text-muted">New orders appear here the moment they are sent.</p></div></div>
      ) : (
        <div className="grid min-h-0 min-w-0 flex-1 content-start gap-3 overflow-y-auto p-2 sm:p-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 17rem), 1fr))" }}>
          {tickets.map((t) => {
            const age = mins(t.sentAt);
            const late = age >= lateMinutes;
            const allReady = t.items.every((i) => i.status === "ready");
            const started = t.items.some((i) => i.status === "preparing");
            return (
              <article key={t.orderId} className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface shadow-card", late ? "border-danger" : "border-line")}>
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
                        className={cn("min-h-10 shrink-0 rounded-md border px-3 py-2 text-xs font-medium", i.status === "sent" ? "border-line text-muted hover:bg-surface-2" : "border-success text-success hover:bg-success-soft")}>{i.status === "sent" ? "Start" : "Ready"}</button> : null}
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
