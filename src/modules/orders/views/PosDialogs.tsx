"use client";
import { useEffect, useState } from "react";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { Input, Select, Textarea } from "@/ui/inputs";
import { cn } from "@/ui/cn";
import { useRunAction } from "@/ui/ActionForm";
import { currencyFractionDigits, formatMoney } from "@/platform/money";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/platform/tenancy/settings";
import type { Catalog, CatalogProduct } from "@/modules/menu/service";
import { applyRewardAction, discountAction, payAction, searchCustomersAction, setCustomerAction, voidOrderAction } from "../actions";
import { checkOrderChargeAction, startOrderChargeAction } from "@/modules/payments/actions";
import type { OrderView } from "../types";

const toMinor = (text: string, currency: string) => Math.round(Number(text.replace(/,/g, "")) * 10 ** currencyFractionDigits(currency)) || 0;
const toText = (minor: number, currency: string) => (minor / 10 ** currencyFractionDigits(currency)).toFixed(currencyFractionDigits(currency));

export function ConfigureDialog({ product, catalog, currency, onClose, onAdd }: { product: CatalogProduct; catalog: Catalog; currency: string; onClose: () => void; onAdd: (s: { variantId: string | null; optionIds: string[]; qty: number; note: string }) => void }) {
  const fmt = (n: number) => formatMoney(n, currency);
  const [variantId, setVariantId] = useState<string | null>(product.variants.find((v) => v.isDefault)?.id ?? product.variants[0]?.id ?? null);
  const [picked, setPicked] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const groups = product.modifierGroupIds.map((id) => catalog.modifierGroups.find((g) => g.id === id)).filter(Boolean) as Catalog["modifierGroups"];
  const toggle = (gid: string, oid: string, max: number) => setPicked((cur) => {
    const g = groups.find((x) => x.id === gid)!; const inGroup = g.options.map((o) => o.id);
    if (cur.includes(oid)) return cur.filter((x) => x !== oid);
    if (max === 1) return [...cur.filter((x) => !inGroup.includes(x)), oid];
    if (max > 0 && cur.filter((x) => inGroup.includes(x)).length >= max) return cur;
    return [...cur, oid];
  });
  const missing = groups.find((g) => g.options.filter((o) => picked.includes(o.id)).length < g.minSelect);
  const unit = (product.variants.find((v) => v.id === variantId)?.priceMinor ?? product.branchPriceMinor ?? product.basePriceMinor) + groups.flatMap((g) => g.options).filter((o) => picked.includes(o.id)).reduce((a, o) => a + o.priceMinor, 0);
  return (
    <Dialog open onClose={onClose} title={product.name} size="md" footer={<>
      <div className="mr-auto inline-flex items-center rounded-lg border border-line"><button className="px-3 py-1.5" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease">−</button><span className="num w-8 text-center">{qty}</span><button className="px-3 py-1.5" onClick={() => setQty(qty + 1)} aria-label="Increase">+</button></div>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button disabled={!!missing} onClick={() => onAdd({ variantId, optionIds: picked, qty, note })}>Add · {fmt(unit * qty)}</Button></>}>
      <div className="space-y-5">
        {product.variants.length > 1 ? <fieldset><legend className="mb-2 text-sm font-medium">Size</legend><div className="flex flex-wrap gap-2">{product.variants.map((v) => (
          <button key={v.id} onClick={() => setVariantId(v.id)} className={cn("rounded-lg border px-3 py-2 text-sm", variantId === v.id ? "border-primary bg-primary-soft text-primary" : "border-line")}>{v.name} · {fmt(v.priceMinor)}</button>))}</div></fieldset> : null}
        {groups.map((g) => (
          <fieldset key={g.id}><legend className="mb-2 text-sm font-medium">{g.name}<span className="ml-2 text-xs font-normal text-muted">{g.minSelect > 0 ? "Required" : "Optional"}{g.maxSelect > 0 ? ` · up to ${g.maxSelect}` : ""}</span></legend>
            <div className="flex flex-wrap gap-2">{g.options.map((o) => (
              <button key={o.id} onClick={() => toggle(g.id, o.id, g.maxSelect)} className={cn("rounded-lg border px-3 py-2 text-sm", picked.includes(o.id) ? "border-primary bg-primary-soft text-primary" : "border-line")}>{o.name}{o.priceMinor ? ` · +${fmt(o.priceMinor)}` : ""}</button>))}</div></fieldset>
        ))}
        <div><label className="mb-1 block text-sm font-medium" htmlFor="pos-note">Kitchen note</label><Input id="pos-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. no onions" /></div>
      </div>
    </Dialog>
  );
}

export function PayDialog({ order, methods, currency, onClose, onPaid }: { order: OrderView; methods: string[]; currency: string; onClose: () => void; onPaid: (o: OrderView) => void }) {
  const { run, pending } = useRunAction();
  const fmt = (n: number) => formatMoney(n, currency);
  const due = order.totalMinor - order.paidMinor;
  const [method, setMethod] = useState(methods[0] ?? "cash");
  const [amount, setAmount] = useState(toText(due, currency));
  const [tendered, setTendered] = useState(toText(due, currency));
  const [ref, setRef] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<{ reference: string; url: string; amountMinor: number } | null>(null);
  const [waiting, setWaiting] = useState("");
  const [copied, setCopied] = useState(false);
  // Poll Paystack (via the server) until the customer has paid; the webhook may settle it first, either is fine.
  useEffect(() => {
    if (!link) return;
    let stop = false;
    const tick = async () => {
      const res = await checkOrderChargeAction({ reference: link.reference });
      if (stop) return;
      if (res.ok && res.data.status === "success" && res.data.order) { stop = true; onPaid(res.data.order); }
      else if (res.ok && res.data.status === "failed") { stop = true; setWaiting(res.data.message ?? "The payment failed."); setLink(null); }
      else if (res.ok && res.data.status === "review") { stop = true; setWaiting(res.data.message ?? "Needs review."); setLink(null); }
    };
    const t = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link?.reference]);
  const amountMinor = toMinor(amount, currency);
  const tenderedMinor = toMinor(tendered, currency);
  const change = method === "cash" ? Math.max(0, tenderedMinor - Math.min(amountMinor, due)) : 0;
  const notes = [1000, 2000, 5000, 10000].map((n) => n * 10 ** currencyFractionDigits(currency));
  return (
    <Dialog open onClose={onClose} title="Take payment" description={`Order #${order.number} · balance ${fmt(due)}`} footer={<>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      {method === "paystack" ? <Button loading={pending} disabled={amountMinor <= 0 || !!link}
        onClick={() => run(startOrderChargeAction, { orderId: order.id, amountMinor: Math.min(amountMinor, due), email: email || undefined }, { onDone: (r) => { setWaiting(""); setLink({ reference: r.reference, url: r.authorizationUrl, amountMinor: r.amountMinor }); }, refresh: false })}>Create Paystack payment link</Button> :
      <Button loading={pending} disabled={amountMinor <= 0 || (method === "cash" && tenderedMinor < Math.min(amountMinor, due))}
        onClick={() => run(payAction, { orderId: order.id, method, amountMinor, tenderedMinor: method === "cash" ? tenderedMinor : null, reference: ref || null, clientKey: key }, { success: "Payment recorded", onDone: (o) => onPaid(o as OrderView) })}>Confirm {fmt(Math.min(amountMinor, due) || 0)}</Button>}</>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">{methods.map((m) => <button key={m} onClick={() => setMethod(m)} className={cn("rounded-lg border px-3 py-2 text-sm font-medium", method === m ? "border-primary bg-primary-soft text-primary" : "border-line text-muted")}>{PAYMENT_METHOD_LABEL[m as PaymentMethod] ?? m}</button>)}</div>
        {method === "paystack" ? (<div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-sm font-medium" htmlFor="pay-amt">Amount to charge</label><Input id="pay-amt" className="num text-right" inputMode="decimal" disabled={!!link} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><label className="mb-1 block text-sm font-medium" htmlFor="pay-email">Customer email (optional)</label><Input id="pay-email" type="email" disabled={!!link} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="for the Paystack receipt" /></div>
          </div>
          {waiting ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{waiting}</p> : null}
          {link ? (<div className="space-y-2 rounded-lg bg-surface-2 p-4 text-sm">
            <p className="font-medium">Waiting for the customer to pay {fmt(link.amountMinor)}…</p>
            <p className="break-all text-muted">{link.url}</p>
            <div className="flex flex-wrap gap-2"><a className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg" href={link.url} target="_blank" rel="noreferrer">Open payment page</a>
              <button className="rounded-md border border-line px-3 py-1.5 text-sm" onClick={() => { void navigator.clipboard?.writeText(link.url); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
              <button className="rounded-md border border-line px-3 py-1.5 text-sm" onClick={() => setLink(null)}>Cancel link</button></div>
            <p className="text-xs text-muted">The order closes automatically as soon as Paystack confirms the payment.</p></div>) : <p className="text-sm text-muted">Customer pays by card, M-Pesa or bank on their own phone. Share the link or open it on this device.</p>}
        </div>) : null}
        {method !== "paystack" ? (<div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-sm font-medium" htmlFor="pay-amt">Amount to apply</label><Input id="pay-amt" className="num text-right" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setTendered(e.target.value); }} /></div>
          {method === "cash" ? <div><label className="mb-1 block text-sm font-medium" htmlFor="pay-ten">Cash received</label><Input id="pay-ten" className="num text-right" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} /></div>
            : <div><label className="mb-1 block text-sm font-medium" htmlFor="pay-ref">Reference</label><Input id="pay-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={method === "mpesa" ? "e.g. QGH7XK2L9P" : "Optional"} /></div>}
        </div>) : null}
        {method === "cash" ? (<>
          <div className="flex flex-wrap gap-2"><button className="rounded-md bg-surface-2 px-2.5 py-1 text-xs" onClick={() => setTendered(toText(due, currency))}>Exact</button>
            {notes.map((n) => <button key={n} className="rounded-md bg-surface-2 px-2.5 py-1 text-xs" onClick={() => setTendered(toText(n, currency))}>{fmt(n)}</button>)}</div>
          <div className="flex items-baseline justify-between rounded-lg bg-surface-2 px-4 py-3"><span className="text-sm text-muted">Change due</span><span className="num text-xl font-semibold">{fmt(change)}</span></div>
        </>) : null}
      </div>
    </Dialog>
  );
}

export function DiscountDialog({ order, currency, onClose }: { order: OrderView; currency: string; onClose: () => void }) {
  const { run, pending } = useRunAction();
  const [kind, setKind] = useState<"percent" | "amount">(order.discountKind ?? "percent");
  const [value, setValue] = useState(order.discountValue != null ? (kind === "percent" ? String(order.discountValue / 100) : toText(order.discountValue, currency)) : "");
  const [reason, setReason] = useState(order.discountReason ?? "");
  const minor = kind === "percent" ? Math.round(Number(value) * 100) || 0 : toMinor(value, currency);
  return (
    <Dialog open onClose={onClose} title="Discount" size="sm" footer={<>
      {order.discountKind ? <Button variant="ghost" className="mr-auto text-danger" onClick={() => run(discountAction, { orderId: order.id, kind: null, value: 0, reason: "" }, { onDone: onClose })}>Remove</Button> : null}
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button loading={pending} disabled={minor <= 0 || reason.trim().length < 3} onClick={() => run(discountAction, { orderId: order.id, kind, value: minor, reason }, { success: "Discount applied", onDone: onClose })}>Apply</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">{(["percent", "amount"] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={cn("rounded-lg border py-2 text-sm font-medium", kind === k ? "border-primary bg-primary-soft text-primary" : "border-line text-muted")}>{k === "percent" ? "Percent %" : `Amount (${currency})`}</button>)}</div>
        <Input aria-label="Discount value" className="num text-right" inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "percent" ? "10" : "0.00"} />
        <Input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, e.g. staff meal)" maxLength={200} />
      </div>
    </Dialog>
  );
}

export function VoidDialog({ order, onClose, onDone }: { order: OrderView; onClose: () => void; onDone: () => void }) {
  const { run, pending } = useRunAction();
  const [reason, setReason] = useState("");
  return (
    <Dialog open onClose={onClose} title={`Cancel order #${order.number}?`} description="Items are cancelled and unused stock is returned. This is recorded in the audit log." size="sm" footer={<>
      <Button variant="outline" onClick={onClose}>Keep order</Button>
      <Button variant="danger" loading={pending} disabled={reason.trim().length < 3} onClick={() => run(voidOrderAction, { orderId: order.id, reason }, { success: "Order cancelled", refresh: false, onDone })}>Cancel order</Button></>}>
      <Textarea aria-label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" autoFocus />
    </Dialog>
  );
}

export function CustomerDialog({ order, rewards, onClose }: { order: OrderView; rewards: { id: string; name: string; pointsCost: number }[]; onClose: () => void }) {
  const { run, pending } = useRunAction();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; phone: string | null; pointsBalance: number }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(async () => { const r = await searchCustomersAction({ q }); if (r.ok) setFound(r.data); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Dialog open onClose={onClose} title="Customer" size="sm" footer={<>{order.customerId && !order.rewardDiscountMinor ? <Button variant="ghost" className="mr-auto text-danger" onClick={() => run(setCustomerAction, { orderId: order.id, customerId: null }, { onDone: onClose })}>Remove</Button> : null}<Button variant="outline" onClick={onClose}>Close</Button></>}>
      <div className="space-y-4">
        {order.customerId ? <p className="text-sm">Attached: <strong>{order.customerName}</strong></p> : null}
        {!order.customerId ? <>
          <Input aria-label="Search customers" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" />
          <ul className="divide-y divide-line rounded-lg border border-line">{found.map((c) => (
            <li key={c.id}><button disabled={pending} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => run(setCustomerAction, { orderId: order.id, customerId: c.id }, { onDone: onClose })}><span>{c.name}<span className="block text-xs text-muted">{c.phone}</span></span><span className="num text-xs text-muted">{c.pointsBalance} pts</span></button></li>))}
            {q.length >= 2 && !found.length ? <li className="px-3 py-4 text-center text-sm text-muted">No customers found.</li> : null}</ul></> : null}
        {order.customerId && order.rewardPoints === 0 && rewards.length ? <div><div className="mb-2 text-sm font-medium">Redeem a reward</div><div className="space-y-2">{rewards.map((r) => (
          <button key={r.id} disabled={pending} onClick={() => run(applyRewardAction, { orderId: order.id, rewardId: r.id }, { success: "Reward applied", onDone: onClose })} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:border-primary"><span>{r.name}</span><span className="num text-xs text-muted">{r.pointsCost} pts</span></button>))}</div></div> : null}
      </div>
    </Dialog>
  );
}
