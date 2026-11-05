"use client";
import { useState, type ReactNode } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";

/** Shows a one-time secret (invite link, pairing code) after an action succeeds. */
export function RevealDialog({ title, description, value, onClose }: { title: string; description: string; value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open onClose={onClose} title={title} description={description} size="sm" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3">
        <code className="min-w-0 flex-1 break-all text-sm font-semibold tracking-wide">{value}</code>
        <Button variant="outline" size="sm" icon={copied ? <LuCheck className="size-4" /> : <LuCopy className="size-4" />}
          onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); } catch { /* clipboard unavailable */ } }}>{copied ? "Copied" : "Copy"}</Button>
      </div>
    </Dialog>
  );
}

/** Wraps a trigger-bearing form dialog and opens a RevealDialog with whatever the action returned. */
export function useReveal<T>(render: (d: T) => { title: string; description: string; value: string }): { onSuccess: (d: T) => void; node: ReactNode } {
  const [data, setData] = useState<T | null>(null);
  const r = data ? render(data) : null;
  return { onSuccess: setData, node: r ? <RevealDialog {...r} onClose={() => setData(null)} /> : null };
}
