"use client";
import { ActionForm, Field, SubmitButton } from "@/ui/ActionForm";
import { Input, Select, Switch, Textarea, Checkbox } from "@/ui/inputs";
import { MoneyInput } from "@/ui/MoneyInput";
import { RowsEditor } from "@/ui/RowsEditor";
import { Button } from "@/ui/Button";
import { ProductImageField } from "./ProductImageField";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { saveProductAction } from "../actions";
import type { Catalog, CatalogProduct } from "../service";

export function ProductForm({ catalog, product, currency }: { catalog: Catalog; product?: CatalogProduct; currency: string }) {
  return (
    <ActionForm action={saveProductAction} successMessage="Item saved" redirectTo="/app/menu" className="grid gap-5 lg:grid-cols-[1fr_340px]">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <div className="space-y-5">
        <Card>
          <CardHeader title="Details" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" required className="sm:col-span-2"><Input id="name" name="name" defaultValue={product?.name} required autoFocus={!product} /></Field>
            <Field label="Category" name="categoryId" required>
              <Select id="categoryId" name="categoryId" defaultValue={product?.categoryId ?? catalog.categories[0]?.id} required>
                {catalog.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Kitchen station" name="stationId" hint="Where the ticket is sent.">
              <Select id="stationId" name="stationId" defaultValue={product?.stationId ?? ""}><option value="">None (no kitchen ticket)</option>{catalog.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </Field>
            <Field label="Description" name="description" className="sm:col-span-2"><Textarea id="description" name="description" defaultValue={product?.description} rows={2} /></Field>
            <Field label="Product photo" name="imageUrl" hint="Upload a JPG, PNG, or WebP image to Cloudflare R2, or paste an HTTPS image link." className="sm:col-span-2">
              <ProductImageField name={product?.name ?? "New"} initialUrl={product?.imageUrl ?? ""} />
            </Field>
            <Field label="SKU" name="sku"><Input id="sku" name="sku" defaultValue={product?.sku ?? ""} /></Field>
            <Field label="Prep time (minutes)" name="prepMinutes"><Input id="prepMinutes" name="prepMinutes" type="number" min={0} max={240} defaultValue={product?.prepMinutes ?? 10} /></Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Price & variants" description="Variants replace the base price at the POS (e.g. Regular / Large)." />
          <CardBody className="space-y-4">
            <Field label="Base price" name="basePriceMinor" required><MoneyInput name="basePriceMinor" currency={currency} defaultMinor={product?.basePriceMinor} required /></Field>
            <Field label="Variants" name="variants"><RowsEditor name="variants" currency={currency} addLabel="Add variant" initial={product?.variants.map((v) => ({ id: v.id, name: v.name, priceMinor: v.priceMinor })) ?? []}
              columns={[{ key: "name", label: "Name", kind: "text", placeholder: "Large" }, { key: "priceMinor", label: "Price", kind: "money", width: "w-36" }]} /></Field>
          </CardBody>
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Status" />
          <CardBody className="space-y-4">
            <Switch name="isActive" label="Active" hint="Inactive items are hidden from the POS." defaultChecked={product?.isActive ?? true} />
            <Switch name="isTaxExempt" label="Tax exempt" hint="No tax is charged on this item." defaultChecked={product?.isTaxExempt ?? false} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Modifier groups" description="Extras and choices offered with this item." />
          <CardBody className="space-y-3">
            {catalog.modifierGroups.length === 0 ? <p className="text-sm text-muted">No modifier groups yet. Create them under Menu → Modifiers.</p> : catalog.modifierGroups.map((g) => (
              <Checkbox key={g.id} name="modifierGroupIds[]" value={g.id} label={g.name} hint={g.options.map((o) => o.name).join(", ")} defaultChecked={product?.modifierGroupIds.includes(g.id)} />
            ))}
          </CardBody>
        </Card>
        <div className="flex gap-2"><SubmitButton className="flex-1">Save item</SubmitButton><Button variant="outline" href="/app/menu">Cancel</Button></div>
      </div>
    </ActionForm>
  );
}
