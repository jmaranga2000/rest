import Link from "next/link";
import type { ReactNode } from "react";
import { LuUtensilsCrossed } from "react-icons/lu";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <aside className="relative hidden overflow-hidden bg-[#1b1a4a] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-[#4338ca]/40 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-[#0d9488]/30 blur-3xl" aria-hidden />
        <Link href="/" className="relative flex items-center gap-2.5 text-lg font-semibold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white text-[#4338ca]"><LuUtensilsCrossed className="size-5" /></span>Restaurant OS
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Run service, stock and sales from one calm screen.</h2>
          <p className="mt-4 text-white/70">Orders flow from the till to the kitchen in seconds, stock updates itself, and every shilling is accounted for at close of day.</p>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {["Fast touch POS with split payments and M-Pesa", "Kitchen display with live tickets and timers", "Recipes, purchasing and stock that stays honest"].map((t) => <li key={t} className="flex gap-3"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#2dd4bf]" />{t}</li>)}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">© {new Date().getFullYear()} Restaurant OS</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-10"><div className="w-full max-w-sm">{children}</div></main>
    </div>
  );
}
