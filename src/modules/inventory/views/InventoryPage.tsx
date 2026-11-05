import Link from "next/link";
import { LuBookOpen, LuPackage, LuPlus, LuTriangleAlert } from "react-icons/lu";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { ConfirmButton } from "@/ui/ActionForm";
import { EmptyState, PageHeader, StatCard, Tabs } from "@/ui/misc";
import { SearchInput } from "@/ui/SearchInput";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatMoney } from "@/platform/money";
import { archiveItemAction } from "../actions";
import { formatQty } from "../units";
import type { StockRow } from "../service";
import { ItemDialog, MovementDialog, RecipeDialog } from "./InventoryDialogs";

export type InvTab = "stock" | "low" | "recipes";
export function InventoryPage({ rows, tab, branchId, branchName, currency, suppliers, products, recipes, can }: {
  rows: StockRow[]; tab: InvTab; branchId: string; branchName: string; currency: string; suppliers: { id: string; name: string }[];
  products: { id: string; name: string; category: string }[]; recipes: Record<string, { itemId: string; qtyMilli: number }[]>; can: { manage: boolean; adjust: boolean };
}) {
  const fmt = (n: number) => formatMoney(n, currency);
  const low = rows.filter((r) => r.isLow);
  const shown = tab === "low" ? low : rows;
  const cats = [...new Set(rows.map((r) => r.category))];
  const total = rows.reduce((a, r) => a + r.valueMinor, 0);
  return (<>
    <PageHeader title="Inventory" description={`Ingredient stock at ${branchName}, valued at weighted-average cost.`} actions={can.manage ? <ItemDialog branchId={branchId} currency={currency} suppliers={suppliers} categories={cats} trigger={<Button icon={<LuPlus className="size-4" />}>New item</Button>} /> : null} />
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><StatCard label="Stock value" value={fmt(total)} icon={<LuPackage />} /><StatCard label="Items" value={rows.length} /><StatCard label="Low or out" value={low.length} icon={<LuTriangleAlert />} /></div>
    <Tabs items={[{ href: "/app/inventory", label: "Stock", active: tab === "stock", count: rows.length }, { href: "/app/inventory?tab=low", label: "Low stock", active: tab === "low", count: low.length }, { href: "/app/inventory?tab=recipes", label: "Recipes", active: tab === "recipes" }]} />
    <div className="mt-4">
      {tab === "recipes" ? (
        <Card className="overflow-x-auto"><Table><THead><TR><TH>Menu item</TH><TH>Category</TH><TH>Ingredients</TH><TH /></TR></THead><TBody>{products.map((p) => (
          <TR key={p.id}><TD className="font-medium">{p.name}</TD><TD className="text-muted">{p.category}</TD><TD>{recipes[p.id]?.length ? <Badge tone="success">{recipes[p.id]!.length} ingredients</Badge> : <span className="text-muted">No recipe</span>}</TD>
            <TD align="right">{can.manage ? <RecipeDialog product={p} items={rows} current={recipes[p.id] ?? []} trigger={<Button variant="ghost" size="sm" icon={<LuBookOpen className="size-4" />}>Edit</Button>} /> : null}</TD></TR>))}</TBody></Table></Card>
      ) : (<>
        <div className="mb-4 max-w-sm"><SearchInput placeholder="Search stock" /></div>
        {!shown.length ? <EmptyState icon={<LuPackage className="size-6" />} title={tab === "low" ? "Nothing is running low" : "No stock items yet"} description={tab === "low" ? undefined : "Add ingredients, then link them to menu items as recipes so sales deduct stock automatically."} /> : (
          <Card className="overflow-x-auto"><Table><THead><TR><TH>Item</TH><TH>Category</TH><TH align="right">On hand</TH><TH align="right">Reorder at</TH><TH align="right">Value</TH><TH /></TR></THead>
            <TBody>{shown.map((r) => (<TR key={r.id}>
              <TD><span className="font-medium">{r.name}</span>{r.isLow ? <Badge tone={r.qtyMilli <= 0 ? "danger" : "warning"} className="ml-2">{r.qtyMilli <= 0 ? "Out" : "Low"}</Badge> : null}</TD>
              <TD className="text-muted">{r.category}</TD><TD align="right" className="num">{formatQty(r.qtyMilli, r.unit)}</TD><TD align="right" className="num text-muted">{r.reorderMilli ? formatQty(r.reorderMilli, r.unit) : "—"}</TD><TD align="right" className="num">{fmt(r.valueMinor)}</TD>
              <TD align="right"><div className="flex justify-end gap-1">{can.adjust ? <MovementDialog item={r} branchId={branchId} currency={currency} trigger={<Button variant="outline" size="sm">Receive / adjust</Button>} /> : null}
                {can.manage ? <ItemDialog item={r} branchId={branchId} currency={currency} suppliers={suppliers} categories={cats} trigger={<Button variant="ghost" size="sm">Edit</Button>} /> : null}
                {can.manage ? <ConfirmButton action={archiveItemAction} input={{ id: r.id }} title={`Archive ${r.name}?`} variant="ghost" danger confirmLabel="Archive">×</ConfirmButton> : null}</div></TD></TR>))}</TBody></Table></Card>)}</>)}
    </div></>);
}
