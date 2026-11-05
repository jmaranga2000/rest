"use client";
import { useState } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button, IconButton } from "./Button";
import { currencyFractionDigits } from "@/platform/money";

export interface RowColumn { key: string; label: string; kind: "text" | "money"; placeholder?: string; width?: string }
type Row = Record<string, string | number | boolean | undefined> & { id?: string };

/** Editable list of rows, submitted as ONE hidden JSON field. Money columns hold integer minor units. */
export function RowsEditor({ name, initial, columns, currency, addLabel = "Add row", minRows = 0 }: { name: string; initial: Row[]; columns: RowColumn[]; currency: string; addLabel?: string; minRows?: number }) {
  const digits = currencyFractionDigits(currency);
  const blank = (): Row => Object.fromEntries(columns.map((c) => [c.key, c.kind === "money" ? 0 : ""]));
  const [rows, setRows] = useState<Row[]>(initial.length || !minRows ? initial : Array.from({ length: minRows }, blank));
  const set = (i: number, key: string, v: string | number) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(rows.filter((r) => columns.some((c) => String(r[c.key] ?? "").trim() !== "" && r[c.key] !== 0 || c.kind === "text" && String(r[c.key] ?? "").trim() !== "")))} />
      {rows.length > 0 ? (
        <div className="hidden gap-2 px-1 text-xs font-medium text-muted sm:flex">
          {columns.map((c) => <span key={c.key} className={c.width ?? "flex-1"}>{c.label}</span>)}<span className="w-9" />
        </div>
      ) : null}
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          {columns.map((c) => c.kind === "money" ? (
            <input key={c.key} aria-label={c.label} inputMode="decimal" className={`control num text-right ${c.width ?? "flex-1"}`} placeholder={(0).toFixed(digits)}
              defaultValue={Number(r[c.key]) ? (Number(r[c.key]) / 10 ** digits).toFixed(digits) : ""}
              onChange={(e) => set(i, c.key, Math.round(Number(e.target.value.replace(/,/g, "")) * 10 ** digits) || 0)} />
          ) : (
            <input key={c.key} aria-label={c.label} className={`control ${c.width ?? "flex-1"}`} placeholder={c.placeholder} value={String(r[c.key] ?? "")} onChange={(e) => set(i, c.key, e.target.value)} />
          ))}
          <IconButton label="Remove row" size="sm" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}><LuTrash2 className="size-4" /></IconButton>
        </div>
      ))}
      <Button variant="ghost" size="sm" icon={<LuPlus className="size-4" />} onClick={() => setRows((rs) => [...rs, blank()])}>{addLabel}</Button>
    </div>
  );
}
