"use client";
import type { ReactNode } from "react";
import { FormDialog, Field } from "@/ui/ActionForm";
import { Input, Switch } from "@/ui/inputs";
import { RowsEditor } from "@/ui/RowsEditor";
import { saveCategoryAction, saveModifierGroupAction, saveStationAction } from "../actions";
import type { Category, ModifierGroup, Station } from "../service";

const COLORS = ["#64748b", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#6366f1", "#a855f7", "#ec4899"];

export function CategoryDialog({ category, trigger }: { category?: Category; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={category ? "Edit category" : "New category"} action={saveCategoryAction} successMessage="Category saved" size="sm">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <Field label="Name" name="name" required><Input id="name" name="name" defaultValue={category?.name} required autoFocus /></Field>
      <Field label="Colour" name="color">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <label key={c} className="cursor-pointer"><input type="radio" name="color" value={c} defaultChecked={(category?.color ?? COLORS[0]) === c} className="peer sr-only" />
              <span className="block size-7 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-focus-visible:ring-2" style={{ background: c, ["--tw-ring-color" as string]: c }} /></label>
          ))}
        </div>
      </Field>
      <Switch name="isActive" label="Visible on the POS" defaultChecked={category?.isActive ?? true} />
    </FormDialog>
  );
}

export function StationDialog({ station, trigger }: { station?: Station; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={station ? "Rename station" : "New kitchen station"} description="Stations split tickets between prep areas, e.g. Grill, Bar, Cold." action={saveStationAction} successMessage="Station saved" size="sm">
      {station ? <input type="hidden" name="id" value={station.id} /> : null}
      <Field label="Name" name="name" required><Input id="name" name="name" defaultValue={station?.name} required autoFocus /></Field>
    </FormDialog>
  );
}

export function ModifierGroupDialog({ group, currency, trigger }: { group?: ModifierGroup; currency: string; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={group ? "Edit modifier group" : "New modifier group"} action={saveModifierGroupAction} successMessage="Modifier group saved" size="lg">
      {group ? <input type="hidden" name="id" value={group.id} /> : null}
      <Field label="Name" name="name" required><Input id="name" name="name" defaultValue={group?.name} placeholder="Extras" required autoFocus /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Minimum choices" name="minSelect" hint="0 = optional"><Input id="minSelect" name="minSelect" type="number" min={0} defaultValue={group?.minSelect ?? 0} /></Field>
        <Field label="Maximum choices" name="maxSelect"><Input id="maxSelect" name="maxSelect" type="number" min={1} defaultValue={group?.maxSelect ?? 1} /></Field>
      </div>
      <Field label="Options" name="options"><RowsEditor name="options" currency={currency} addLabel="Add option" minRows={2}
        initial={group?.options.map((o) => ({ id: o.id, name: o.name, priceMinor: o.priceMinor })) ?? []}
        columns={[{ key: "name", label: "Option", kind: "text", placeholder: "Extra cheese" }, { key: "priceMinor", label: "Extra price", kind: "money", width: "w-36" }]} /></Field>
    </FormDialog>
  );
}
