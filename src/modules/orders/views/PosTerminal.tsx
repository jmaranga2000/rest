"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuArrowLeft, LuBanknote, LuLayoutGrid, LuList, LuChefHat, LuMinus, LuPercent, LuPlus, LuReceipt, LuSearch, LuTrash2, LuUser, LuUtensils } from "react-icons/lu";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { cn } from "@/ui/cn";
import { LiveRefresh } from "@/ui/LiveRefresh";
import { ProductThumb } from "@/ui/ProductThumb";
import { useRunAction } from "@/ui/ActionForm";
import { ThemeToggle } from "@/ui/ThemeToggle";
import { formatMoney } from "@/platform/money";
import type { Catalog, CatalogProduct } from "@/modules/menu/service";
import { effectivePrice } from "@/modules/menu/pricing";
import { addItemsAction, openOrderAction, removeItemAction, sendToKitchenAction, updateItemAction } from "../actions";
import { ITEM_STATUS_LABEL, type OrderView } from "../types";
import type { TableState } from "../service";
import { ConfigureDialog, CustomerDialog, DiscountDialog, PayDialog, VoidDialog } from "./PosDialogs";

export interface PosProps {
  branchId: string; branchName: string; currency: string; catalog: Catalog; tables: TableState[]; orders: OrderView[]; activeOrderId: string | null;
  orderTypes: string[]; paymentMethods: string[]; hasOpenShift: boolean; requireShift: boolean; rewards: { id: string; name: string; pointsCost: number }[];
  can: { create: boolean; discount: boolean; void: boolean; pay: boolean; customers: boolean }; userName: string;
}
const TYPE_LABEL: Record<string, string> = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery", pickup: "Pickup" };

export function PosTerminal(p: PosProps) {
  const fmt = (n: number) => formatMoney(n, p.currency);
  const { run, pending } = useRunAction();
  const router = useRouter();
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [configure, setConfigure] = useState<CatalogProduct | null>(null);
  const [dialog, setDialog] = useState<null | "pay" | "discount" | "customer" | "void">(null);
  const [view, setView] = useState<"menu" | "ticket">("menu");
  const [compact, setCompact] = useState(false);
  const [optimisticOrder, setOptimisticOrder] = useState<OrderView | null>(null);
  const [pendingAdd, setPendingAdd] = useState<{ id: string; name: string; variantName: string | null; qty: number; lineTotalMinor: number } | null>(null);
  const [pendingDineInItems, setPendingDineInItems] = useState<{ productId: string; variantId: string | null; optionIds: string[]; qty: number; note: string | null }[] | null>(null);
  useEffect(() => { try { setCompact(localStorage.getItem("pos.compact") === "1"); } catch { /* storage unavailable */ } }, []);
  const toggleCompact = () => setCompact((c) => { const n = !c; try { localStorage.setItem("pos.compact", n ? "1" : "0"); } catch { /* ignore */ } return n; });
  const order = (optimisticOrder?.id === p.activeOrderId ? optimisticOrder : null) ?? p.orders.find((o) => o.id === p.activeOrderId) ?? null;
  const [newType, setNewType] = useState(p.orderTypes[0] ?? "takeaway");

  const products = useMemo(() => p.catalog.products.filter((x) => (cat === "all" || x.categoryId === cat) && (!q || x.name.toLowerCase().includes(q.toLowerCase()))), [p.catalog.products, cat, q]);
  const held = order?.items.filter((i) => i.status === "held").length ?? 0;
  const live = order?.items.filter((i) => i.status !== "void") ?? [];
  const due = order ? order.totalMinor - order.paidMinor : 0;

  const go = (id: string | null) => { router.push(id ? `/pos?order=${id}` : "/pos"); router.refresh(); };

  function addProduct(prod: CatalogProduct, sel?: { variantId?: string | null; optionIds?: string[]; qty?: number; note?: string }) {
    if (!p.can.create) return;
    const items = [{ productId: prod.id, variantId: sel?.variantId ?? null, optionIds: sel?.optionIds ?? [], qty: sel?.qty ?? 1, note: sel?.note ?? null }];
    const variant = sel?.variantId ? prod.variants.find((v) => v.id === sel.variantId) : prod.variants.find((v) => v.isDefault);
    const selectedOptions = new Set(sel?.optionIds ?? []);
    const modifierTotal = p.catalog.modifierGroups.flatMap((g) => g.options).filter((o) => selectedOptions.has(o.id)).reduce((sum, o) => sum + o.priceMinor, 0);
    setPendingAdd({ id: `pending-${Date.now()}`, name: prod.name, variantName: variant && prod.variants.length > 1 ? variant.name : null, qty: sel?.qty ?? 1, lineTotalMinor: ((variant?.priceMinor ?? effectivePrice(prod)) + modifierTotal) * (sel?.qty ?? 1) });
    setView("ticket");
    const clearPending = () => setPendingAdd(null);
    if (order) return run(addItemsAction, { orderId: order.id, items }, {
      onDone: (updated) => { setOptimisticOrder(updated as OrderView); clearPending(); },
      onError: clearPending,
    });
    if (newType === "dine_in") {
      setPendingDineInItems((queued) => [...(queued ?? []), ...items]);
      return;
    }
    run(openOrderAction, { branchId: p.branchId, type: newType, clientKey: crypto.randomUUID() }, {
      refresh: false,
      onDone: (opened) => {
        const createdOrder = opened as OrderView;
        setOptimisticOrder(createdOrder);
        router.push(`/pos?order=${createdOrder.id}`);
        run(addItemsAction, { orderId: createdOrder.id, items }, {
          onDone: (updated) => { setOptimisticOrder(updated as OrderView); clearPending(); router.refresh(); },
          onError: clearPending,
        });
      },
      onError: clearPending,
    });
  }

  function chooseTable(tableId: string) {
    const table = p.tables.find((candidate) => candidate.id === tableId);
    if (!table) return;
    if (table.orderId) {
      if (!pendingDineInItems) go(table.orderId);
      return;
    }
    run(openOrderAction, { branchId: p.branchId, type: "dine_in", tableId, clientKey: crypto.randomUUID() }, {
      refresh: false,
      onDone: (opened) => {
        const createdOrder = opened as OrderView;
        setOptimisticOrder(createdOrder);
        router.push(`/pos?order=${createdOrder.id}`);
        if (!pendingDineInItems) return router.refresh();
        run(addItemsAction, { orderId: createdOrder.id, items: pendingDineInItems }, {
          onDone: (updated) => {
            setOptimisticOrder(updated as OrderView);
            setPendingDineInItems(null);
            setPendingAdd(null);
            router.refresh();
          },
          onError: () => { setPendingDineInItems(null); setPendingAdd(null); },
        });
      },
    });
  }

  const tablePicker = (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Pick a table</div>
      {pendingDineInItems ? <p className="mb-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">Choose a table to add {pendingDineInItems.length} selected item{pendingDineInItems.length === 1 ? "" : "s"} to the order.</p> : null}
      <div className="grid grid-cols-3 gap-2">{p.tables.map((t) => (
        <button key={t.id} disabled={pending || (!!pendingDineInItems && !!t.orderId)} onClick={() => chooseTable(t.id)}
          className={cn("rounded-lg border p-2 text-center text-sm disabled:cursor-not-allowed disabled:opacity-50", t.orderId ? "border-warning bg-warning-soft" : "border-line hover:border-primary")}>
          <div className="font-semibold">{t.label}</div><div className="text-xs text-muted">{t.orderId ? fmt(t.totalMinor) : `${t.seats} seats`}</div>
        </button>
      ))}</div>
      {!p.tables.length ? <p className="text-sm text-muted">No tables are set up for this branch.</p> : null}
    </div>
  );
  const needsConfig = (x: CatalogProduct) => x.variants.length > 1 || x.modifierGroupIds.length > 0;

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 sm:h-14 sm:gap-3 sm:px-3">
        <Link href="/app" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label="Back to back office"><LuArrowLeft className="size-5" /></Link>
        <div className="min-w-0"><div className="truncate text-sm font-semibold">{p.branchName}</div><div className="text-xs text-muted">{p.userName}</div></div>
        <div className="ml-auto flex items-center gap-2">
          {p.requireShift && !p.hasOpenShift ? <Link href="/app/shifts" className="rounded-md bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">Open a cash shift</Link> : null}
          <LiveRefresh branchId={p.branchId} topics={["orders", "kitchen"]} />
          <ThemeToggle compactOnMobile />
        </div>
      </header>

      {/* open orders strip */}
      <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-line bg-surface px-2 py-1 sm:px-3 sm:py-2" aria-label="Open orders">
        <button onClick={() => go(null)} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1 text-sm font-medium sm:py-1.5", !order ? "border-primary bg-primary-soft text-primary" : "border-line text-muted hover:bg-surface-2")}><LuPlus className="size-4" />New</button>
        {p.orders.map((o) => (
          <button key={o.id} onClick={() => go(o.id)} className={cn("shrink-0 rounded-lg border px-3 py-1.5 text-left text-sm", o.id === order?.id ? "border-primary bg-primary-soft" : "border-line hover:bg-surface-2")}>
            <span className="font-semibold">{o.tableLabel ? `Table ${o.tableLabel}` : `#${o.number}`}</span>
            <span className="ml-2 num text-xs text-muted">{fmt(o.totalMinor)}</span>
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1">
        {/* menu */}
        <section className={cn("min-h-0 min-w-0 flex-1 flex-col", view === "menu" ? "flex" : "hidden lg:flex")}>
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1.5 sm:px-3 sm:py-2">
            <div className="relative w-[40%] min-w-32 shrink-0 sm:w-full sm:max-w-xs"><LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items" className="control pl-9" /></div>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                {[{ id: "all", name: "All" }, ...p.catalog.categories.filter((c) => c.isActive)].map((c) => (
                  <button key={c.id} onClick={() => setCat(c.id)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-medium", cat === c.id ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-fg")}>{c.name}</button>
                ))}
              </div>
              <button type="button" onClick={toggleCompact} aria-pressed={compact} aria-label={compact ? "Show photo cards" : "Use compact product cards"} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg">
                {compact ? <LuLayoutGrid className="size-3.5" /> : <LuList className="size-3.5" />}<span className="hidden sm:inline">{compact ? "Photo cards" : "Compact"}</span>
              </button>
            </div>
          </div>
          <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto p-2 sm:p-3" style={{ gridTemplateColumns: compact ? "repeat(auto-fill, minmax(8.5rem, 1fr))" : "repeat(auto-fill, minmax(9.5rem, 1fr))" }}>
            {products.map((x) => (
              <button key={x.id} disabled={!x.isAvailable || pending || !p.can.create} onClick={() => (needsConfig(x) ? setConfigure(x) : addProduct(x))}
                className={cn("flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-left transition hover:border-primary hover:shadow-card active:scale-[0.98] disabled:opacity-45", compact ? "min-h-24 justify-between p-3" : "")}>
                {!compact ? <ProductThumb name={x.name} src={x.imageUrl} className="aspect-[4/3] w-full text-2xl" /> : null}
                <span className={cn("flex flex-1 flex-col justify-between", compact ? "w-full" : "p-2.5")}>
                  <span className="line-clamp-2 text-sm font-semibold leading-snug">{x.name}</span>
                  <span className="mt-2 flex items-end justify-between"><span className="num text-sm text-muted">{x.variants.length > 1 ? `from ${fmt(Math.min(...x.variants.map((v) => v.priceMinor)))}` : fmt(effectivePrice(x))}</span>{!x.isAvailable ? <Badge tone="danger">Out</Badge> : null}</span>
                </span>
              </button>
            ))}
            {!products.length ? <p className="col-span-full py-10 text-center text-sm text-muted">No items match.</p> : null}
          </div>
        </section>

        {/* ticket */}
        <aside className={cn("min-h-0 w-full shrink-0 flex-col border-l border-line bg-surface lg:flex lg:w-[26rem]", view === "ticket" ? "flex" : "hidden")}>
          {!order ? (
            <div className="space-y-4 overflow-y-auto p-4">
              <h2 className="font-semibold">{pendingDineInItems ? "Select a table" : pendingAdd ? "Starting order…" : "New order"}</h2>
              {pendingAdd ? (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-primary bg-primary-soft p-3">
                  <div className="min-w-0"><div className="font-medium">{pendingAdd.name}{pendingAdd.variantName ? ` · ${pendingAdd.variantName}` : ""}</div><div className="text-xs text-muted">× {pendingAdd.qty} · Adding to order</div></div>
                  <span className="num shrink-0 text-sm font-medium">{fmt(pendingAdd.lineTotalMinor)}</span>
                </div>
              ) : null}
              {!pendingDineInItems ? (
                <>
                  <div className="flex flex-wrap gap-2">{p.orderTypes.map((t) => <button key={t} onClick={() => setNewType(t)} className={cn("rounded-lg border px-3 py-2 text-sm font-medium", newType === t ? "border-primary bg-primary-soft text-primary" : "border-line text-muted")}>{TYPE_LABEL[t] ?? t}</button>)}</div>
                  {newType === "dine_in" ? tablePicker : <p className="text-sm text-muted">Tap an item to start a {TYPE_LABEL[newType]?.toLowerCase()} order.</p>}
                </>
              ) : tablePicker}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div><div className="font-semibold">{order.tableLabel ? `Table ${order.tableLabel}` : TYPE_LABEL[order.type]} · #{order.number}</div>
                  <button onClick={() => p.can.customers && setDialog("customer")} className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted hover:text-primary"><LuUser className="size-3.5" />{order.customerName ?? "Add customer"}</button></div>
                {p.can.void ? <button onClick={() => setDialog("void")} className="text-xs text-danger hover:underline">Cancel order</button> : null}
              </div>
              <ul className="flex-1 divide-y divide-line overflow-y-auto">
                {pendingAdd ? (
                  <li key={pendingAdd.id} className="border-l-2 border-primary bg-primary-soft/50 px-4 py-3" aria-live="polite">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{pendingAdd.name}{pendingAdd.variantName ? <span className="text-muted"> · {pendingAdd.variantName}</span> : null}</div>
                        <div className="mt-1 text-xs text-primary">Adding to order · × {pendingAdd.qty}</div>
                      </div>
                      <div className="num shrink-0 text-sm font-medium">{fmt(pendingAdd.lineTotalMinor)}</div>
                    </div>
                  </li>
                ) : null}
                {live.map((i) => (
                  <li key={i.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{i.name}{i.variantName ? <span className="text-muted"> · {i.variantName}</span> : null}</div>
                        {i.modifiers.length ? <div className="text-xs text-muted">{i.modifiers.map((m) => m.name).join(", ")}</div> : null}
                        {i.note ? <div className="text-xs italic text-muted">“{i.note}”</div> : null}
                        <div className="mt-1"><Badge tone={i.status === "held" ? "neutral" : i.status === "ready" ? "success" : i.status === "served" ? "info" : "warning"}>{ITEM_STATUS_LABEL[i.status]}</Badge></div>
                      </div>
                      <div className="text-right"><div className="num text-sm font-medium">{fmt(i.lineTotalMinor)}</div>
                        {i.status === "held" ? (
                          <div className="mt-1 inline-flex items-center rounded-lg border border-line">
                            <button aria-label="Decrease" className="p-1.5 hover:bg-surface-2" onClick={() => (i.qty > 1 ? run(updateItemAction, { itemId: i.id, qty: i.qty - 1 }) : run(removeItemAction, { itemId: i.id }))}>{i.qty > 1 ? <LuMinus className="size-3.5" /> : <LuTrash2 className="size-3.5 text-danger" />}</button>
                            <span className="num w-6 text-center text-sm">{i.qty}</span>
                            <button aria-label="Increase" className="p-1.5 hover:bg-surface-2" onClick={() => run(updateItemAction, { itemId: i.id, qty: i.qty + 1 })}><LuPlus className="size-3.5" /></button>
                          </div>
                        ) : <div className="mt-1 text-xs text-muted">× {i.qty}</div>}
                      </div>
                    </div>
                  </li>
                ))}
                {!live.length ? <li className="p-8 text-center text-sm text-muted">Tap items to add them.</li> : null}
              </ul>
              <div className="space-y-1.5 border-t border-line px-4 py-3 text-sm">
                <Row l="Subtotal" v={fmt(order.subtotalMinor)} />
                {order.discountMinor ? <Row l="Discount" v={`− ${fmt(order.discountMinor)}`} tone="success" /> : null}
                {order.serviceChargeMinor ? <Row l="Service charge" v={fmt(order.serviceChargeMinor)} /> : null}
                {order.taxMinor ? <Row l={order.taxInclusive ? "Tax (included)" : "Tax"} v={fmt(order.taxMinor)} /> : null}
                <div className="flex items-baseline justify-between pt-1 text-base font-semibold"><span>Total</span><span className="num text-xl">{fmt(order.totalMinor)}</span></div>
                {order.paidMinor ? <Row l="Paid" v={fmt(order.paidMinor)} /> : null}
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
                {p.can.discount ? <Button variant="outline" icon={<LuPercent className="size-4" />} onClick={() => setDialog("discount")} disabled={!live.length}>Discount</Button> : <span />}
                <Button variant="soft" icon={<LuChefHat className="size-4" />} onClick={() => run(sendToKitchenAction, { orderId: order.id }, { success: "Sent to kitchen" })} disabled={!held || pending}>Send{held ? ` (${held})` : ""}</Button>
                {p.can.pay ? <Button size="lg" className="col-span-2" icon={<LuBanknote className="size-5" />} onClick={() => setDialog("pay")} disabled={!live.length || due <= 0}>Charge {fmt(due)}</Button> : null}
                <Button variant="ghost" href={`/app/orders/${order.id}`} icon={<LuReceipt className="size-4" />} className="col-span-2">Order details</Button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* mobile switch */}
      <div className="flex shrink-0 border-t border-line bg-surface lg:hidden">
        <button onClick={() => setView("menu")} aria-pressed={view === "menu"} className={cn("flex-1 py-2 text-sm font-medium", view === "menu" ? "bg-primary-soft text-primary" : "text-muted")}><LuUtensils className="mx-auto mb-0.5 size-5" />Menu</button>
        <button onClick={() => setView("ticket")} aria-pressed={view === "ticket"} className={cn("flex-1 py-2 text-sm font-medium", view === "ticket" ? "bg-primary-soft text-primary" : "text-muted")}><LuReceipt className="mx-auto mb-0.5 size-5" />Order{order ? ` · ${fmt(order.totalMinor)}` : ""}</button>
      </div>

      {configure ? <ConfigureDialog product={configure} catalog={p.catalog} currency={p.currency} onClose={() => setConfigure(null)} onAdd={(sel) => { addProduct(configure, sel); setConfigure(null); }} /> : null}
      {order && dialog === "pay" ? <PayDialog order={order} methods={p.paymentMethods} currency={p.currency} onClose={() => setDialog(null)} onPaid={(o) => { setDialog(null); if (o.status === "closed") go(null); }} /> : null}
      {order && dialog === "discount" ? <DiscountDialog order={order} currency={p.currency} onClose={() => setDialog(null)} /> : null}
      {order && dialog === "customer" ? <CustomerDialog order={order} rewards={p.rewards} onClose={() => setDialog(null)} /> : null}
      {order && dialog === "void" ? <VoidDialog order={order} onClose={() => setDialog(null)} onDone={() => go(null)} /> : null}
    </div>
  );
}

function Row({ l, v, tone }: { l: string; v: string; tone?: "success" }) {
  return <div className="flex justify-between text-muted"><span>{l}</span><span className={cn("num", tone === "success" && "text-success")}>{v}</span></div>;
}
