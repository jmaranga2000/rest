"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { LuCircleAlert, LuCircleCheck, LuX } from "react-icons/lu";
import { cn } from "./cn";

type ToastKind = "success" | "error";
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ToastApi { success(m: string): void; error(m: string): void }

const Ctx = createContext<ToastApi>({ success: () => undefined, error: () => undefined });
export const useToast = (): ToastApi => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, kind, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  const api = useMemo<ToastApi>(() => ({ success: (m) => push("success", m), error: (m) => push("error", m) }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"}
            className={cn("pointer-events-auto flex max-w-md animate-in items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-pop",
              t.kind === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-success/30 bg-success-soft text-success")}>
            <span className="mt-0.5 text-base">{t.kind === "error" ? <LuCircleAlert /> : <LuCircleCheck />}</span>
            <span className="flex-1 text-fg">{t.message}</span>
            <button type="button" aria-label="Dismiss" className="text-muted hover:text-fg" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}><LuX /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
