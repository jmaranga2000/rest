"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LuCheck, LuMinus, LuPlus, LuShoppingBag, LuX } from "react-icons/lu";
import { ProductThumb } from "@/ui/ProductThumb";
import { cn } from "@/ui/cn";
import { formatMoney } from "@/platform/money";
import type { GuestMenu, GuestOrderStatus } from "../service";

type Res<T> = { ok: true; data: T } | { ok: false; error: { message: string } };
type Product = GuestMenu["products"][number];
interface Line { key: string; productId: string; variantId: string | null; optionIds: string[]; name: string; detail: string; unitMinor: number; qty: number; note: string }

export interface GuestOrderAppProps {
  title: string; subtitle: string; orgName: string; logoUrl: string | null; currency: string; menu: GuestMenu;
  orderingOpen: boolean; closedMessage?: string; autoSend: boolean;
  place: (i: Record<string, unknown>) => Promise<Res<GuestOrderStatus>>;
  status: (i: Record<string, unknown>) => Promise<Res<GuestOrderStatus>>;
  /** Fields added to every call (the QR token, plus the stay code for rooms). */
  base: Record<string, unknown>;
  /** When set, guests must type this code before ordering (rooms). */
  codeField?: { name: string; label: string; hint: string };
  storageId: string;
}

const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
const safe = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const STATUS_LABEL: Record<string, string> = { held: "Waiting for staff", sent: "Sent to kitchen", preparing: "Being prepared", ready: "Ready", served: "Served" };

export function GuestOrderApp(p: GuestOrderAppProps) {
  const fmt = useCallback((n: number) => formatMoney(n, p.currency), [p.currency]);
  const [guestKey, setGuestKey] = useState("");
  const [cat, setCat] = useState<string>("");
  const [cart, setCart] = useState<Line[]>([]);
  const [picking, setPicking] = useState<Product | null>(null);
  const [open, setOpen] = useState<"cart" | "orders" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [st, setSt] = useState<GuestOrderStatus | null>(null);
  const [code, setCode] = useState("");
  const [submitKey, setSubmitKey] = useState("");

  useEffect(() => {
    let k = safe.get(`gk:${p.storageId}`);
    if (!k) { k = rid(); safe.set(`gk:${p.storageId}`, k); }
    setGuestKey(k); setSubmitKey(rid());
    const c = safe.get(`code:${p.storageId}`); if (c) setCode(c);
  }, [p.storageId]);

  const refresh = useCallback(async () => {
    if (!guestKey) return;
    const r = await p.status({ ...p.base, guestKey, ...(p.codeField && code ? { [p.codeField.name]: code } : {}) });
    if (r.ok) setSt(r.data);
  }, [guestKey, p, code]);
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 15_000); return () => clearInterval(t); }, [refresh]);

  const total = cart.reduce((s, l) => s + l.unitMinor * l.qty, 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const cats = p.menu.categories;
  const shown = useMemo(() => p.menu.products.filter((x) => !cat || x.categoryId === cat), [p.menu.products, cat]);

  const add = (prod: Product, variantId: string | null, optionIds: string[]) => {
    const v = prod.variants.find((x) => x.id === variantId);
    const opts = prod.groups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id));
    const unit = (v ? v.priceMinor : prod.priceMinor) + opts.reduce((s, o) => s + o.priceMinor, 0);
    const key = `${prod.id}|${variantId ?? ""}|${[...optionIds].sort().join(",")}`;
    setCart((c) => {
      const hit = c.find((l) => l.key === key);
      if (hit) return c.map((l) => (l.key === key ? { ...l, qty: Math.min(10, l.qty + 1) } : l));
      return [...c, { key, productId: prod.id, variantId, optionIds, name: prod.name, detail: [v?.name, ...opts.map((o) => o.name)].filter(Boolean).join(" · "), unitMinor: unit, qty: 1, note: "" }];
    });
    setPicking(null);
  };
  const bump = (key: string, d: number) => setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0 && l.qty <= 10));

  async function submit() {
    setBusy(true); setErr(null);
    if (p.codeField) safe.set(`code:${p.storageId}`, code);
    const r = await p.place({ ...p.base, guestKey, submitKey, ...(p.codeField ? { [p.codeField.name]: code } : {}), items: cart.map((l) => ({ productId: l.productId, variantId: l.variantId, optionIds: l.optionIds, qty: l.qty, note: l.note || undefined })) });
    setBusy(false);
    if (!r.ok) { setErr(r.error.message); return; }
    setSt(r.data); setCart([]); setSubmitKey(rid()); setOpen("orders");
  }

  const hasOrders = !!st && st.lines.length > 0;
  return (
    <div className="mx-auto min-h-dvh max-w-xl bg-bg pb-28">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center gap-3">
          {p.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.logoUrl} alt="" className="size-10 rounded-lg object-cover" /> : <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-fg">{p.orgName.slice(0, 1)}</span>}
          <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-semibold text-fg">{p.orgName}</p><p className="truncate text-xs text-muted">{p.subtitle}</p></div>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary">{p.title}</span>
        </div>
        {cats.length > 0 && (
          <nav className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5" aria-label="Categories">
            {[{ id: "", name: "All" }, ...cats].map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium", cat === c.id ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface text-muted")}>{c.name}</button>
            ))}
          </nav>
        )}
      </header>

      {!p.orderingOpen && <p className="mx-4 mt-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">{p.closedMessage ?? "Ordering by QR is paused. You can still browse the menu; please ask a waiter to order."}</p>}

      <ul className="divide-y divide-line px-4">
        {shown.map((x) => (
          <li key={x.id} className="flex gap-3 py-4">
            <ProductThumb name={x.name} src={x.imageUrl} className="size-20 rounded-xl text-lg" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-fg">{x.name}</p>
              {x.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{x.description}</p>}
              <p className="mt-1 text-sm font-medium text-fg">{x.variants.length ? `from ${fmt(Math.min(...x.variants.map((v) => v.priceMinor)))}` : fmt(x.priceMinor)}</p>
            </div>
            {p.orderingOpen && (
              <button aria-label={`Add ${x.name}`} onClick={() => (x.variants.length || x.groups.length ? setPicking(x) : add(x, null, []))}
                className="flex size-10 self-center items-center justify-center rounded-full bg-primary text-primary-fg shadow-sm active:scale-95"><LuPlus className="size-5" /></button>
            )}
          </li>
        ))}
        {!shown.length && <li className="py-12 text-center text-sm text-muted">Nothing on the menu here yet.</li>}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl space-y-2 p-3">
        {hasOrders && open !== "orders" && <button onClick={() => setOpen("orders")} className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm font-medium text-fg shadow-lg">Your order · {st!.lines.length} item{st!.lines.length === 1 ? "" : "s"} · track status</button>}
        {count > 0 && <button onClick={() => setOpen("cart")} className="flex w-full items-center justify-between rounded-xl bg-primary px-4 py-3.5 text-primary-fg shadow-lg"><span className="flex items-center gap-2 font-semibold"><LuShoppingBag className="size-5" />View order ({count})</span><span className="font-semibold">{fmt(total)}</span></button>}
      </div>

      {picking && <Sheet title={picking.name} onClose={() => setPicking(null)}><Picker prod={picking} fmt={fmt} onAdd={add} /></Sheet>}

      {open === "cart" && (
        <Sheet title="Your order" onClose={() => setOpen(null)}>
          <ul className="divide-y divide-line">
            {cart.map((l) => (
              <li key={l.key} className="py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1"><p className="font-medium text-fg">{l.name}</p>{l.detail && <p className="text-xs text-muted">{l.detail}</p>}<p className="text-sm text-muted">{fmt(l.unitMinor * l.qty)}</p></div>
                  <div className="flex items-center gap-2"><button aria-label="Fewer" onClick={() => bump(l.key, -1)} className="flex size-8 items-center justify-center rounded-full border border-line-strong"><LuMinus className="size-4" /></button><span className="w-5 text-center text-sm font-semibold">{l.qty}</span><button aria-label="More" onClick={() => bump(l.key, 1)} className="flex size-8 items-center justify-center rounded-full border border-line-strong"><LuPlus className="size-4" /></button></div>
                </div>
                <input value={l.note} maxLength={200} onChange={(e) => setCart((c) => c.map((x) => (x.key === l.key ? { ...x, note: e.target.value } : x)))} placeholder="Note (e.g. no onions)" className="mt-2 h-9 w-full rounded-md border border-line bg-surface px-3 text-[13px]" />
              </li>
            ))}
          </ul>
          {p.codeField && (
            <label className="mt-3 block text-[13px] font-medium text-fg">{p.codeField.label}
              <input inputMode="numeric" autoComplete="off" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="mt-1 h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-lg tracking-[0.3em]" />
              <span className="mt-1 block text-xs font-normal text-muted">{p.codeField.hint}</span>
            </label>
          )}
          {err && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">{err}</p>}
          <div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted">Total (before any service charge)</span><span className="text-base font-semibold">{fmt(total)}</span></div>
          <button disabled={busy || !cart.length || (!!p.codeField && code.length < 3)} onClick={() => void submit()} className="mt-3 h-12 w-full rounded-xl bg-primary font-semibold text-primary-fg disabled:opacity-50">{busy ? "Sending…" : p.autoSend ? "Place order" : "Send order to staff"}</button>
          <p className="mt-2 text-center text-xs text-muted">You pay at the end of your visit; nothing is charged now.</p>
        </Sheet>
      )}

      {open === "orders" && st && (
        <Sheet title={`Your order${st.number ? ` · #${st.number}` : ""}`} onClose={() => setOpen(null)}>
          <p className="mb-3 flex items-center gap-2 rounded-lg bg-success-soft p-3 text-sm text-success"><LuCheck className="size-4" />{st.sentToKitchen ? "Thank you! The kitchen has your order." : "Thank you! Staff will confirm your order shortly."}</p>
          <ul className="divide-y divide-line">
            {st.lines.map((l, i) => (<li key={i} className="flex items-center gap-3 py-2.5 text-sm"><span className="w-6 font-semibold">{l.qty}×</span><span className="min-w-0 flex-1 truncate">{l.name}{l.variantName ? ` (${l.variantName})` : ""}</span><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", l.status === "ready" || l.status === "served" ? "bg-success-soft text-success" : "bg-surface-2 text-muted")}>{STATUS_LABEL[l.status] ?? l.status}</span></li>))}
          </ul>
          <div className="mt-3 flex justify-between text-sm"><span className="text-muted">Your items</span><span className="font-semibold">{fmt(st.totalMinor)}</span></div>
          <button onClick={() => setOpen(null)} className="mt-4 h-11 w-full rounded-xl border border-line-strong font-medium">Order more</button>
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="mx-auto max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-surface p-4 pb-6 shadow-2xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><button aria-label="Close" onClick={onClose} className="flex size-8 items-center justify-center rounded-full bg-surface-2"><LuX className="size-4" /></button></div>
        {children}
      </div>
    </div>
  );
}

function Picker({ prod, fmt, onAdd }: { prod: Product; fmt: (n: number) => string; onAdd: (p: Product, v: string | null, o: string[]) => void }) {
  const [variant, setVariant] = useState<string | null>(prod.variants.find((v) => v.isDefault)?.id ?? prod.variants[0]?.id ?? null);
  const [opts, setOpts] = useState<string[]>([]);
  const missing = prod.groups.find((g) => prod.groups && opts.filter((o) => g.options.some((x) => x.id === o)).length < g.minSelect);
  const toggle = (gid: string, oid: string, max: number) => setOpts((cur) => {
    const g = prod.groups.find((x) => x.id === gid)!;
    if (cur.includes(oid)) return cur.filter((x) => x !== oid);
    const inGroup = cur.filter((x) => g.options.some((o) => o.id === x));
    if (max === 1) return [...cur.filter((x) => !inGroup.includes(x)), oid];
    if (max > 0 && inGroup.length >= max) return cur;
    return [...cur, oid];
  });
  return (
    <div className="space-y-4">
      {prod.variants.length > 0 && (<fieldset><legend className="mb-2 text-sm font-semibold">Size</legend><div className="space-y-2">{prod.variants.map((v) => (<label key={v.id} className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm"><input type="radio" name="variant" checked={variant === v.id} onChange={() => setVariant(v.id)} /><span className="flex-1">{v.name}</span><span className="text-muted">{fmt(v.priceMinor)}</span></label>))}</div></fieldset>)}
      {prod.groups.map((g) => (<fieldset key={g.id}><legend className="mb-2 text-sm font-semibold">{g.name}<span className="ml-2 text-xs font-normal text-muted">{g.minSelect > 0 ? "Required" : "Optional"}{g.maxSelect > 0 ? ` · up to ${g.maxSelect}` : ""}</span></legend><div className="space-y-2">{g.options.map((o) => (<label key={o.id} className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm"><input type={g.maxSelect === 1 ? "radio" : "checkbox"} name={g.id} checked={opts.includes(o.id)} onChange={() => toggle(g.id, o.id, g.maxSelect)} /><span className="flex-1">{o.name}</span>{o.priceMinor > 0 && <span className="text-muted">+{fmt(o.priceMinor)}</span>}</label>))}</div></fieldset>))}
      <button disabled={!!missing} onClick={() => onAdd(prod, variant, opts)} className="h-12 w-full rounded-xl bg-primary font-semibold text-primary-fg disabled:opacity-50">Add to order</button>
    </div>
  );
}
