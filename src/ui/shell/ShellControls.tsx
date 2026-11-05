"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LuChevronDown, LuLogOut, LuMenu, LuStore, LuX } from "react-icons/lu";
import { Avatar } from "../misc";
import { ThemeToggle } from "../ThemeToggle";
import { cn } from "../cn";

export function MobileDrawer({ children, brand }: { children: ReactNode; brand: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        {brand}
        <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="-mr-2 rounded-md p-2 text-fg hover:bg-surface-2"><LuMenu className="size-5" /></button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] animate-in flex-col bg-surface shadow-modal" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-2 top-3 rounded-md p-2 text-muted hover:bg-surface-2"><LuX className="size-5" /></button>
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function BranchSwitcher({ branches, activeId, action }: { branches: { id: string; name: string }[]; activeId: string | null; action: (id: string) => Promise<unknown> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (branches.length === 0) return null;
  if (branches.length === 1) {
    return <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-[13px] font-medium text-fg"><LuStore className="size-4 text-muted" aria-hidden /><span className="truncate">{branches[0]!.name}</span></div>;
  }
  return (
    <label className="relative block">
      <span className="sr-only">Active branch</span>
      <LuStore className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <select className={cn("control h-9 appearance-none bg-surface-2 pl-9 pr-8 text-[13px] font-medium", pending && "opacity-60")} value={activeId ?? ""} disabled={pending}
        onChange={(e) => start(async () => { await action(e.target.value); router.refresh(); })}>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <LuChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </label>
  );
}

export function UserMenu({ name, role, color, logout }: { name: string; role: string; color: string; logout: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface-2">
        <Avatar name={name} color={color} />
        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-fg">{name}</span><span className="block truncate text-xs text-muted">{role}</span></span>
        <LuChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute inset-x-0 bottom-full z-50 mb-2 animate-in space-y-2 rounded-lg border border-line bg-surface p-3 shadow-pop">
          <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">Appearance</p><ThemeToggle /></div>
          <button type="button" role="menuitem" disabled={pending} onClick={() => start(async () => { await logout(); router.push("/login"); router.refresh(); })}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[13px] font-medium text-danger hover:bg-danger-soft">
            <LuLogOut className="size-4" aria-hidden />Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
