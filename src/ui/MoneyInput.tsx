"use client";
import { useState } from "react";
import { currencyFractionDigits } from "@/platform/money";
import { cn } from "./cn";

/**
 * Shows a decimal amount ("1250.50") but submits integer MINOR units under `name`,
 * so server code never parses currency strings.
 */
export function MoneyInput({ name, currency, defaultMinor = 0, className, required, id, disabled }: { name: string; currency: string; defaultMinor?: number; className?: string; required?: boolean; id?: string; disabled?: boolean }) {
  const digits = currencyFractionDigits(currency);
  const [text, setText] = useState(defaultMinor ? (defaultMinor / 10 ** digits).toFixed(digits) : "");
  const minor = text === "" ? "" : String(Math.round(Number(text.replace(/,/g, "")) * 10 ** digits) || 0);
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-subtle">{currency}</span>
      <input id={id ?? name} type="text" inputMode="decimal" className="control num pl-12 text-right" value={text} required={required} disabled={disabled}
        onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={(0).toFixed(digits)} />
      <input type="hidden" name={name} value={minor} />
    </div>
  );
}
