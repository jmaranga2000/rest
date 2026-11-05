"use client";
import { useState, type ReactNode } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button, IconButton } from "@/ui/Button";
import { Field, FormDialog } from "@/ui/ActionForm";
import { Input, Select } from "@/ui/inputs";
import { MoneyInput } from "@/ui/MoneyInput";
import { Dialog } from "@/ui/Dialog";
import { useRunAction } from "@/ui/ActionForm";
import { currencyFractionDigits, formatMoney } from "@/platform/money";
import { itemUnits, qtyFromDisplay, UNIT_BASE } from "./unitsClient";
import { movementAction, receivePoAction, saveItemAction, savePoAction, saveSupplierAction, setRecipeAction } from "../actions";
import type { PoRow, StockRow, SupplierRow } from "../service";
import type { BaseUnit } from "../units";

const UnitSelect = ({ base, name = "displayUnit" }: { base: BaseUnit; name?: string }) => <Select name={name} id={name} className="w-24">{itemUnits(base).map((u) => <option key={u}>{u}</option>)}</Select>;

export function ItemDialog({ item, branchId, currency, suppliers, categories, trigger }: { item?: StockRow; branchId: string; currency: string; suppliers: { id: string; name: string }[]; categories: string[]; trigger: ReactNode }) {
  const [unit, setUnit] = useState<BaseUnit>(item?.unit ?? "g");
  return (<FormDialog trigger={trigger} title={item ? `Edit ${item.name}` : "New stock item"} size="md" action={saveItemAction} successMessage="Item saved">
    {item ? <input type="hidden" name="id" value={item.id} /> : null}<input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="unit" value={unit} />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" name="name" required><Input id="name" name="name" defaultValue={item?.name} required autoFocus /></Field>
      <Field label="Category" name="category"><Input id="category" name="category" list="inv-cats" defaultValue={item?.category ?? "General"} /><datalist id="inv-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
      <Field label="Measured in" name="unit"><Select value={unit} disabled={!!item} onChange={(e) => setUnit(e.target.value as BaseUnit)}><option value="g">Weight (kg / g)</option><option value="ml">Volume (l / ml)</option><option value="pcs">Pieces</option></Select></Field>
      <Field label="Enter quantities in" name="displayUnit"><UnitSelect base={unit} /></Field>
      <Field label="Reorder at" name="reorderQty" hint="Flag when stock falls to this."><Input id="reorderQty" name="reorderQty" inputMode="decimal" defaultValue={item ? qtyFromDisplay(item.reorderMilli, item.unit) : ""} /></Field>
      <Field label="Par level" name="parQty" hint="Target stock when fully stocked."><Input id="parQty" name="parQty" inputMode="decimal" defaultValue={item ? qtyFromDisplay(item.parMilli, item.unit) : ""} /></Field>
      {!item ? <><Field label="Opening quantity" name="openingQty"><Input id="openingQty" name="openingQty" inputMode="decimal" /></Field><Field label="Opening stock value" name="openingCostMinor"><MoneyInput name="openingCostMinor" currency={currency} /></Field></> : null}
      <Field label="SKU" name="sku"><Input id="sku" name="sku" defaultValue={item?.sku ?? ""} /></Field>
      <Field label="Usual supplier" name="supplierId"><Select id="supplierId" name="supplierId" defaultValue=""><option value="">None</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field></div>
    {item ? <p className="text-xs text-muted">Quantities for existing stock are changed with Receive, Waste or Adjust.</p> : null}</FormDialog>);
}

export function MovementDialog({ item, branchId, currency, trigger }: { item: StockRow; branchId: string; currency: string; trigger: ReactNode }) {
  const [kind, setKind] = useState("receive");
  return (<FormDialog trigger={trigger} title={item.name} description="Every change is recorded in the stock ledger." size="sm" action={movementAction} successMessage="Stock updated">
    <input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="itemId" value={item.id} />
    <Field label="Action" name="kind"><Select name="kind" id="kind" value={kind} onChange={(e) => setKind(e.target.value)}><option value="receive">Receive stock</option><option value="waste">Record waste</option><option value="adjust_up">Adjust up (found)</option><option value="adjust_down">Adjust down (lost)</option></Select></Field>
    <div className="flex gap-3"><Field label="Quantity" name="qty" required className="flex-1"><Input id="qty" name="qty" inputMode="decimal" required autoFocus /></Field><Field label="Unit" name="displayUnit"><UnitSelect base={item.unit} /></Field></div>
    {kind === "receive" ? <Field label={`Total cost (${currency})`} name="totalCostMinor" hint="What you paid for this delivery."><MoneyInput name="totalCostMinor" currency={currency} /></Field> : <Field label="Reason" name="reason" required><Input id="reason" name="reason" required placeholder="e.g. spoiled, miscount" /></Field>}</FormDialog>);
}

export function RecipeDialog({ product, items, current, trigger }: { product: { id: string; name: string }; items: StockRow[]; current: { itemId: string; qtyMilli: number }[]; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(() => current.map((c) => ({ itemId: c.itemId, qty: String(qtyFromDisplay(c.qtyMilli, items.find((i) => i.id === c.itemId)?.unit ?? "pcs")) })));
  const { run, pending } = useRunAction();
  const unitOf = (id: string) => items.find((i) => i.id === id)?.unit ?? "pcs";
  const save = () => run(setRecipeAction, { productId: product.id, lines: rows.filter((r) => r.itemId && Number(r.qty) > 0).map((r) => ({ itemId: r.itemId, qtyMilli: Math.round(Number(r.qty) * UNIT_BASE[unitOf(r.itemId)] * 1000) })) }, { success: "Recipe saved", onDone: () => setOpen(false) });
  return (<><span onClick={() => setOpen(true)} className="contents">{trigger}</span>
    <Dialog open={open} onClose={() => setOpen(false)} title={`Recipe: ${product.name}`} description="Ingredients used for ONE serving. Stock is deducted when the item is sent to the kitchen." size="md"
      footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={save}>Save recipe</Button></>}>
      <div className="space-y-2">{rows.map((r, i) => (<div key={i} className="flex items-center gap-2">
        <Select aria-label="Ingredient" value={r.itemId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}><option value="">Choose ingredient…</option>{items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}</Select>
        <Input aria-label="Quantity" className="w-28 text-right" inputMode="decimal" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
        <span className="w-10 text-xs text-muted">{r.itemId ? (unitOf(r.itemId) === "g" ? "kg" : unitOf(r.itemId) === "ml" ? "l" : "pcs") : ""}</span>
        <IconButton label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><LuTrash2 className="size-4" /></IconButton></div>))}
        <Button variant="outline" size="sm" icon={<LuPlus className="size-4" />} onClick={() => setRows([...rows, { itemId: "", qty: "" }])}>Add ingredient</Button></div></Dialog></>);
}

export function SupplierDialog({ supplier, trigger }: { supplier?: SupplierRow; trigger: ReactNode }) {
  return (<FormDialog trigger={trigger} title={supplier ? "Edit supplier" : "New supplier"} size="md" action={saveSupplierAction} successMessage="Supplier saved">
    {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
    <Field label="Name" name="name" required><Input id="name" name="name" defaultValue={supplier?.name} required autoFocus /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Contact person" name="contact"><Input id="contact" name="contact" defaultValue={supplier?.contact ?? ""} /></Field><Field label="Phone" name="phone"><Input id="phone" name="phone" defaultValue={supplier?.phone ?? ""} /></Field>
      <Field label="Email" name="email"><Input id="email" name="email" type="email" defaultValue={supplier?.email ?? ""} /></Field><Field label="Address" name="address"><Input id="address" name="address" defaultValue={supplier?.address ?? ""} /></Field></div></FormDialog>);
}

export function PoDialog({ branchId, suppliers, items, currency, trigger }: { branchId: string; suppliers: { id: string; name: string }[]; items: StockRow[]; currency: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [rows, setRows] = useState([{ itemId: "", qty: "", total: "" }]);
  const { run, pending } = useRunAction();
  const unitOf = (id: string) => items.find((i) => i.id === id)?.unit ?? "pcs";
  const minor = (t: string) => Math.round(Number(t || 0) * 10 ** currencyFractionDigits(currency));
  const lines = rows.filter((r) => r.itemId && Number(r.qty) > 0).map((r) => ({ itemId: r.itemId, qtyMilli: Math.round(Number(r.qty) * UNIT_BASE[unitOf(r.itemId)] * 1000), lineTotalMinor: minor(r.total) }));
  return (<><span onClick={() => setOpen(true)} className="contents">{trigger}</span>
    <Dialog open={open} onClose={() => setOpen(false)} title="New purchase order" size="lg" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button loading={pending} disabled={!supplierId || !lines.length} onClick={() => run(savePoAction, { branchId, supplierId, lines }, { success: "Draft saved", onDone: () => { setOpen(false); setRows([{ itemId: "", qty: "", total: "" }]); } })}>Save draft · {formatMoney(lines.reduce((a, l) => a + l.lineTotalMinor, 0), currency)}</Button></>}>
      <div className="space-y-4"><Field label="Supplier"><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <div className="space-y-2">{rows.map((r, i) => (<div key={i} className="flex items-center gap-2">
          <Select aria-label="Item" value={r.itemId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}><option value="">Item…</option>{items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}</Select>
          <Input aria-label="Quantity" className="w-24 text-right" placeholder="Qty" inputMode="decimal" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
          <Input aria-label="Line total" className="w-32 text-right" placeholder={`Total ${currency}`} inputMode="decimal" value={r.total} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, total: e.target.value } : x)))} />
          <IconButton label="Remove" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : rows)}><LuTrash2 className="size-4" /></IconButton></div>))}
          <Button variant="outline" size="sm" icon={<LuPlus className="size-4" />} onClick={() => setRows([...rows, { itemId: "", qty: "", total: "" }])}>Add line</Button></div></div></Dialog></>);
}

export function ReceiveDialog({ po, currency, trigger }: { po: PoRow; currency: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const outstanding = po.lines.map((l) => ({ ...l, left: l.qtyMilli - l.receivedMilli }));
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(outstanding.map((l) => [l.id, String(qtyFromDisplay(l.left, l.unit))])));
  const [cost, setCost] = useState<Record<string, string>>(() => Object.fromEntries(outstanding.map((l) => [l.id, String((l.lineTotalMinor - l.receivedTotalMinor) / 10 ** currencyFractionDigits(currency))])));
  const { run, pending } = useRunAction();
  const dec = 10 ** currencyFractionDigits(currency);
  return (<><span onClick={() => setOpen(true)} className="contents">{trigger}</span>
    <Dialog open={open} onClose={() => setOpen(false)} title={`Receive ${po.number}`} description="Enter what actually arrived and what you were charged." size="lg" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button loading={pending} onClick={() => run(receivePoAction, { id: po.id, lines: outstanding.filter((l) => l.left > 0).map((l) => ({ lineId: l.id, qtyMilli: Math.min(l.left, Math.round(Number(qty[l.id] || 0) * UNIT_BASE[l.unit] * 1000)), totalMinor: Math.round(Number(cost[l.id] || 0) * dec) })) }, { success: "Stock received", onDone: () => setOpen(false) })}>Book delivery</Button></>}>
      <div className="space-y-2">{outstanding.filter((l) => l.left > 0).map((l) => (<div key={l.id} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</span>
        <Input aria-label={`${l.name} quantity`} className="w-24 text-right" inputMode="decimal" value={qty[l.id]} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} /><span className="w-8 text-xs text-muted">{l.unit === "g" ? "kg" : l.unit === "ml" ? "l" : "pcs"}</span>
        <Input aria-label={`${l.name} cost`} className="w-28 text-right" inputMode="decimal" value={cost[l.id]} onChange={(e) => setCost({ ...cost, [l.id]: e.target.value })} /></div>))}</div></Dialog></>);
}
