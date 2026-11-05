import Link from "next/link";
import { LuPencil, LuPlus, LuTrash2, LuUtensilsCrossed } from "react-icons/lu";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { ProductThumb } from "@/ui/ProductThumb";
import { Card } from "@/ui/Card";
import { ConfirmButton } from "@/ui/ActionForm";
import { EmptyState, PageHeader, Tabs } from "@/ui/misc";
import { SearchInput } from "@/ui/SearchInput";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatMoney } from "@/platform/money";
import { deleteCategoryAction, deleteModifierGroupAction, deleteStationAction } from "../actions";
import { effectivePrice, type Catalog } from "../service";
import { AvailabilityToggle } from "./AvailabilityToggle";
import { CategoryDialog, ModifierGroupDialog, StationDialog } from "./MenuDialogs";

export type MenuTab = "items" | "categories" | "modifiers" | "stations";

export interface MenuPageProps {
  catalog: Catalog; tab: MenuTab; q?: string; category?: string;
  currency: string; branchId: string | null; branchName: string | null;
  can: { manage: boolean; availability: boolean };
}

export function MenuPage({ catalog, tab, q, category, currency, branchId, branchName, can }: MenuPageProps) {
  const fmt = (n: number) => formatMoney(n, currency);
  const href = (t: MenuTab) => `/app/menu${t === "items" ? "" : `?tab=${t}`}`;
  const phrase = q?.trim().toLowerCase();
  const products = catalog.products.filter((p) => (!category || p.categoryId === category) && (!phrase || `${p.name} ${p.sku ?? ""}`.toLowerCase().includes(phrase)));

  return (
    <>
      <PageHeader title="Menu" description={`What you sell, how it's priced and which kitchen station prepares it.${branchName ? ` Availability shown for ${branchName}.` : ""}`}
        actions={can.manage ? (tab === "items" ? <Button href="/app/menu/items/new" icon={<LuPlus className="size-4" />}>New item</Button>
          : tab === "categories" ? <CategoryDialog trigger={<Button icon={<LuPlus className="size-4" />}>New category</Button>} />
          : tab === "modifiers" ? <ModifierGroupDialog currency={currency} trigger={<Button icon={<LuPlus className="size-4" />}>New group</Button>} />
          : <StationDialog trigger={<Button icon={<LuPlus className="size-4" />}>New station</Button>} />) : null} />
      <Tabs items={[
        { href: href("items"), label: "Items", active: tab === "items", count: catalog.products.length },
        { href: href("categories"), label: "Categories", active: tab === "categories", count: catalog.categories.length },
        { href: href("modifiers"), label: "Modifiers", active: tab === "modifiers", count: catalog.modifierGroups.length },
        { href: href("stations"), label: "Stations", active: tab === "stations", count: catalog.stations.length },
        { href: "/app/menu/qr", label: "QR codes", active: false },
      ]} />

      {tab === "items" ? (
        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
            <SearchInput placeholder="Search items or SKU" />
            <div className="flex flex-wrap gap-1.5">
              <Link href="/app/menu" className={`rounded-full px-3 py-1 text-[13px] font-medium ${!category ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-fg"}`}>All</Link>
              {catalog.categories.map((c) => (
                <Link key={c.id} href={`/app/menu?category=${c.id}`} className={`rounded-full px-3 py-1 text-[13px] font-medium ${category === c.id ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-fg"}`}>{c.name}</Link>
              ))}
            </div>
          </div>
          {products.length === 0 ? (
            <EmptyState icon={<LuUtensilsCrossed />} title={catalog.products.length ? "No items match" : "Your menu is empty"} description={catalog.products.length ? "Try a different search or category." : catalog.categories.length ? "Add your first item to start taking orders." : "Create a category first, then add items to it."}
              action={can.manage ? (catalog.categories.length ? <Button href="/app/menu/items/new">Add item</Button> : <CategoryDialog trigger={<Button>Create category</Button>} />) : undefined} />
          ) : (
            <Table>
              <THead><TR><TH>Item</TH><TH>Category</TH><TH>Station</TH><TH align="right">Price</TH><TH>{branchName ? "Available" : ""}</TH><TH /></TR></THead>
              <TBody>
                {products.map((p) => (
                  <TR key={p.id} className={p.isActive ? "" : "opacity-60"}>
                    <TD><div className="flex items-center gap-3"><ProductThumb name={p.name} src={p.imageUrl} className="size-10 rounded-lg text-xs" /><div><div className="font-medium">{p.name}</div><div className="text-xs text-muted">{p.variants.length ? `${p.variants.length} variants` : p.sku ?? ""}{!p.isActive ? " · Archived" : ""}</div></div></div></TD>
                    <TD>{p.categoryName}</TD>
                    <TD className="text-muted">{p.stationName ?? "—"}</TD>
                    <TD align="right">{fmt(effectivePrice(p))}{p.branchPriceMinor != null ? <Badge tone="info" className="ml-2">Branch</Badge> : null}</TD>
                    <TD>{branchId ? <AvailabilityToggle branchId={branchId} productId={p.id} isAvailable={p.isAvailable} disabled={!can.availability} /> : null}</TD>
                    <TD align="right">{can.manage ? <Button variant="ghost" size="sm" href={`/app/menu/items/${p.id}`} icon={<LuPencil className="size-3.5" />}>Edit</Button> : null}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === "categories" ? (
        <Card>
          {catalog.categories.length === 0 ? <EmptyState title="No categories yet" description="Categories group items on the POS screen." /> : (
            <Table>
              <THead><TR><TH>Category</TH><TH align="right">Active items</TH><TH>Status</TH><TH /></TR></THead>
              <TBody>{catalog.categories.map((c) => (
                <TR key={c.id}>
                  <TD><span className="mr-2 inline-block size-3 rounded-full align-middle" style={{ background: c.color }} /><span className="font-medium">{c.name}</span></TD>
                  <TD align="right">{c.productCount}</TD>
                  <TD>{c.isActive ? <Badge tone="success" dot>Visible</Badge> : <Badge dot>Hidden</Badge>}</TD>
                  <TD align="right">{can.manage ? <div className="flex justify-end gap-1">
                    <CategoryDialog category={c} trigger={<Button variant="ghost" size="sm" icon={<LuPencil className="size-3.5" />}>Edit</Button>} />
                    <ConfirmButton action={deleteCategoryAction} input={{ id: c.id }} title={`Delete "${c.name}"?`} confirmLabel="Delete" danger variant="ghost" icon={<LuTrash2 className="size-3.5" />}>Delete</ConfirmButton>
                  </div> : null}</TD>
                </TR>))}</TBody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === "modifiers" ? (
        catalog.modifierGroups.length === 0 ? <Card><EmptyState title="No modifier groups" description="Create groups like “Extras” or “Spice level”, then attach them to items." /></Card> : (
          <div className="grid gap-4 md:grid-cols-2">
            {catalog.modifierGroups.map((g) => (
              <Card key={g.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-semibold">{g.name}</h3><p className="text-xs text-muted">Choose {g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}–${g.maxSelect}`} · used by {g.productCount} item{g.productCount === 1 ? "" : "s"}</p></div>
                  {can.manage ? <div className="flex gap-1">
                    <ModifierGroupDialog group={g} currency={currency} trigger={<Button variant="ghost" size="sm" icon={<LuPencil className="size-3.5" />}>Edit</Button>} />
                    <ConfirmButton action={deleteModifierGroupAction} input={{ id: g.id }} title={`Delete "${g.name}"?`} description="It will be removed from every item." confirmLabel="Delete" danger variant="ghost" icon={<LuTrash2 className="size-3.5" />}>{""}</ConfirmButton>
                  </div> : null}
                </div>
                <ul className="mt-3 divide-y divide-line text-sm">{g.options.map((o) => <li key={o.id} className="flex justify-between py-1.5"><span>{o.name}</span><span className="num text-muted">{o.priceMinor ? `+${fmt(o.priceMinor)}` : "Free"}</span></li>)}</ul>
              </Card>
            ))}
          </div>
        )
      ) : null}

      {tab === "stations" ? (
        <Card>
          {catalog.stations.length === 0 ? <EmptyState title="No stations" description="Add stations like Grill or Bar to route tickets." /> : (
            <ul className="divide-y divide-line">{catalog.stations.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-5 py-3">
                <span className="font-medium">{s.name}</span>
                {can.manage ? <div className="flex gap-1">
                  <StationDialog station={s} trigger={<Button variant="ghost" size="sm" icon={<LuPencil className="size-3.5" />}>Rename</Button>} />
                  <ConfirmButton action={deleteStationAction} input={{ id: s.id }} title={`Remove "${s.name}"?`} description="Items using it will have no kitchen station." confirmLabel="Remove" danger variant="ghost" icon={<LuTrash2 className="size-3.5" />}>{""}</ConfirmButton>
                </div> : null}
              </li>))}</ul>
          )}
        </Card>
      ) : null}
    </>
  );
}
