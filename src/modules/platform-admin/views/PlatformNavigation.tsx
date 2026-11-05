"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LuBuilding2, LuInbox, LuMenu, LuShieldCheck, LuX } from "react-icons/lu";
import { cn } from "@/ui/cn";

const LINKS = [
  { href: "/platform", label: "Organisations", icon: LuBuilding2 },
  { href: "/platform/requests", label: "Plan requests", icon: LuInbox },
  { href: "/platform/security", label: "Security", icon: LuShieldCheck },
];

function Brand() {
  return (
    <Link href="/platform" className="flex items-center gap-2.5 font-semibold tracking-tight text-fg">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><LuShieldCheck className="size-5" aria-hidden /></span>
      <span>Operator console</span>
    </Link>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Operator console" className="space-y-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === "/platform" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-fg")}>
            <Icon className="size-[18px] shrink-0" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function PlatformNavigation({ name, logout }: { name: string; logout: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 shrink-0 items-center border-b border-line px-5"><Brand /></div>
          <div className="flex-1 overflow-y-auto p-3"><Navigation /></div>
          <div className="shrink-0 border-t border-line p-4">
            <p className="mb-3 truncate px-1 text-sm font-medium text-fg">{name}</p>
            {logout}
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Brand />
        <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-controls="platform-mobile-navigation" aria-expanded={open}
          onClick={() => setOpen((value) => !value)} className="rounded-lg p-2 text-fg hover:bg-surface-2">
          {open ? <LuX className="size-5" aria-hidden /> : <LuMenu className="size-5" aria-hidden />}
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute inset-0 size-full cursor-default bg-[var(--overlay)]" />
          <div id="platform-mobile-navigation" role="dialog" aria-modal="true" aria-label="Operator console navigation"
            className="absolute inset-y-0 left-0 flex w-80 max-w-[88%] animate-in flex-col border-r border-line bg-surface shadow-modal">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
              <Brand />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"><LuX className="size-5" aria-hidden /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3"><Navigation onNavigate={() => setOpen(false)} /></div>
            <div className="shrink-0 border-t border-line p-4">
              <p className="mb-3 truncate px-1 text-sm font-medium text-fg">{name}</p>
              {logout}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
