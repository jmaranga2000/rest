"use client";
import { useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";

/** A labelled, copyable value (URLs to paste into the Paystack dashboard). */
export function CopyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-[13px] font-medium">{label}</div>
      <div className="flex items-center gap-2"><code className="num min-w-0 flex-1 break-all rounded bg-surface px-2 py-1.5 text-xs">{value}</code>
        <button type="button" aria-label={`Copy ${label}`} className="rounded-md border border-line p-2" onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? <LuCheck /> : <LuCopy />}</button></div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>);
}
