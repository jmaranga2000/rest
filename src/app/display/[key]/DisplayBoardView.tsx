"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuClock, LuUtensils } from "react-icons/lu";
import type { BoardOrder, DisplayBoard } from "@/modules/admin/service";
import { formatMoney } from "@/platform/money";

const TYPE_LABEL: Record<string, string> = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery" };

/** Customer-facing screen for a TV or tablet. Public, no login, always dark. Refreshes itself every few seconds. */
export function DisplayBoardView({ board, now: initialNow }: { board: DisplayBoard; now?: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => (initialNow ? new Date(initialNow) : new Date()));
  const [slideIx, setSlideIx] = useState(0);

  useEffect(() => { const t = setInterval(() => router.refresh(), 5000); return () => clearInterval(t); }, [router]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);

  const slide = board.slides.length ? board.slides[slideIx % board.slides.length]! : null;
  useEffect(() => {
    if (board.slides.length < 2) return;
    const t = setTimeout(() => setSlideIx((n) => n + 1), (slide?.durationS ?? 8) * 1000);
    return () => clearTimeout(t);
  }, [slideIx, slide?.durationS, board.slides.length]);

  const clock = useMemo(() => {
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(board.locale, { timeZone: board.timezone, ...o }).format(now);
    return { time: f({ hour: "2-digit", minute: "2-digit", hour12: false }), date: f({ weekday: "short", day: "numeric", month: "short", year: "numeric" }) };
  }, [now, board.locale, board.timezone]);
  const at = (iso: string) => new Intl.DateTimeFormat(board.locale, { timeZone: board.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

  const photos = useMemo(() => board.menu.flatMap((g) => g.items).filter((i) => i.imageUrl).map((i) => i.imageUrl!), [board.menu]);
  const hero = slide?.imageUrl ?? (photos.length ? photos[slideIx % photos.length]! : null);

  return (
    <div className="flex h-dvh min-h-[640px] flex-col overflow-hidden bg-[#070d1f] text-white" style={{ backgroundImage: "radial-gradient(1200px 600px at 20% -10%, #14224d 0%, transparent 60%), radial-gradient(900px 500px at 100% 100%, #0b3b3a 0%, transparent 55%)" }}>
      <header className="flex items-center gap-6 px-8 py-4">
        <div className="flex items-center gap-4">
          {board.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={board.logoUrl} alt="" className="size-14 rounded-2xl object-cover" />
            : <div className="grid size-14 place-items-center rounded-2xl bg-orange-500 text-2xl text-white shadow-lg shadow-orange-500/30"><LuUtensils /></div>}
          <div>
            <h1 className="text-3xl font-bold leading-none tracking-tight">{board.orgName}</h1>
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-sky-300/70">{[board.branchName, board.city].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="hidden flex-1 items-center justify-center gap-6 font-serif text-xl italic text-white/80 xl:flex">
          {board.slides.slice(0, 3).map((s, i) => <span key={s.id} className="flex items-center gap-6">{i > 0 ? <span className="h-5 w-px bg-orange-500" /> : null}{s.title}</span>)}
        </div>
        <div className="ml-auto flex items-center gap-3 text-right">
          <LuClock className="size-6 text-orange-400" aria-hidden />
          <div><div className="num text-3xl font-bold leading-none tabular-nums">{clock.time}</div><div className="mt-1 text-[11px] text-white/45">{clock.date}</div></div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-5 px-8 pb-4 lg:grid-cols-[1fr_1.05fr_1.35fr_1fr]">
        <OrderColumn tone="amber" title="Waiting orders" orders={board.waiting} at={at} />
        <Promo slide={slide} hero={hero} count={board.slides.length} index={slideIx} />
        <Menu board={board} />
        <OrderColumn tone="emerald" title="Ready orders" orders={board.ready} at={at} ready />
      </main>

      <footer className="flex items-center gap-4 border-t border-white/10 bg-white/[0.03] px-8 py-3 text-sm">
        {slide ? <><span className="font-semibold text-orange-400">Today&apos;s special</span><span className="h-4 w-px bg-white/25" /><span className="text-white/90">{[slide.title, slide.body].filter(Boolean).join(" — ")}</span></> : <span className="text-white/60">Welcome</span>}
        <span className="ml-auto font-serif text-lg italic text-white/90">Thank you! <span className="text-orange-400">♥</span></span>
      </footer>
    </div>
  );
}

function OrderColumn({ title, orders, tone, at, ready }: { title: string; orders: BoardOrder[]; tone: "amber" | "emerald"; at: (iso: string) => string; ready?: boolean }) {
  const c = tone === "amber"
    ? { head: "text-orange-400 border-orange-500/40 bg-orange-500/5", badge: "bg-orange-500", bar: "bg-orange-500", chip: "bg-orange-500/20 text-orange-300", panel: "from-orange-950/30" }
    : { head: "text-emerald-400 border-emerald-500/40 bg-emerald-500/5", badge: "bg-emerald-500", bar: "bg-emerald-500", chip: "bg-emerald-500/20 text-emerald-300", panel: "from-emerald-950/40" };
  return (
    <section className={`flex min-h-0 flex-col rounded-3xl border border-white/10 bg-gradient-to-b ${c.panel} to-transparent p-4`} aria-label={title}>
      <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${c.head}`}>
        <h2 className="flex items-center gap-2 whitespace-nowrap text-base font-extrabold uppercase tracking-wide xl:text-lg">{ready ? <LuCheck aria-hidden /> : <LuClock aria-hidden />}{title}</h2>
        <span className={`num grid size-8 place-items-center rounded-full text-sm font-bold text-white ${c.badge}`}>{orders.length}</span>
      </div>
      <ul className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {orders.slice(0, 7).map((o) => (
          <li key={o.number} className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#101a4a]/70 py-3 pl-5 pr-4">
            <span className={`absolute inset-y-0 left-0 w-1.5 ${c.bar}`} />
            <div className="flex items-baseline justify-between"><span className="num text-2xl font-extrabold tracking-wide">#{o.number.split("-").pop()}</span><span className="num text-xs text-white/50">{at(o.openedAt)}</span></div>
            <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-white/60">{TYPE_LABEL[o.type] ?? o.type}</div>
            <ul className="mt-2 space-y-0.5 text-sm text-white/85">
              {o.items.slice(0, 3).map((i, ix) => <li key={ix}><span className="text-white/50">{i.qty} ×</span> {i.name}</li>)}
              {o.items.length > 3 ? <li className="text-white/50">+{o.items.length - 3} more</li> : null}
            </ul>
            <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${c.chip}`}>{ready ? "Ready for pickup" : "Preparing"}</span>
          </li>))}
        {!orders.length ? <li className="grid flex-1 place-items-center rounded-2xl border border-dashed border-white/15 text-white/45">No orders right now</li> : null}
        {orders.length > 7 ? <li className="text-center text-sm text-white/50">+{orders.length - 7} more</li> : null}
      </ul>
    </section>
  );
}

function Promo({ slide, hero, count, index }: { slide: DisplayBoard["slides"][number] | null; hero: string | null; count: number; index: number }) {
  const words = (slide?.title ?? "Freshly made, always").split(" ");
  const last = words.pop();
  return (
    <section className="relative hidden min-h-0 overflow-hidden rounded-3xl border border-white/10 lg:block" aria-label="Promotion"
      style={{ background: slide ? `linear-gradient(160deg, ${slide.accent}55, #0b1230 70%)` : "#0b1230" }}>
      {hero
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={hero} alt="" className="absolute inset-0 size-full object-cover opacity-35" />
        : null}
      <div className="absolute inset-0 bg-gradient-to-b from-[#070d1f]/60 via-transparent to-[#070d1f]/90" />
      <div className="relative flex h-full flex-col p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-orange-300">Fresh from our kitchen</p>
        <h2 className="mt-5 text-6xl font-extrabold leading-[1.02] tracking-tight xl:text-7xl">{words.join(" ")} <span className="font-serif italic text-orange-400">{last}</span></h2>
        <p className="mt-6 max-w-xs text-lg text-white/85">{slide?.body || "From our kitchen to your table, prepared with care."}</p>
        {count > 1 ? <div className="mt-auto flex gap-1.5" aria-hidden>{Array.from({ length: count }, (_, i) => <span key={i} className={`h-1.5 rounded-full ${i === index % count ? "w-8 bg-orange-400" : "w-1.5 bg-white/30"}`} />)}</div> : null}
      </div>
    </section>
  );
}

/** The menu auto-scrolls when it is taller than the column, pausing at each end. */
function Menu({ board }: { board: DisplayBoard }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    let dir = 1; let raf = 0; let lastTime = 0; let holdUntil = performance.now() + 2000;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const tick = (time: number) => {
      const max = el.scrollHeight - el.clientHeight;
      const elapsed = lastTime ? Math.min(time - lastTime, 50) : 0;
      lastTime = time;
      const paused = reducedMotion.matches || document.hidden || el.matches(":hover") || el.contains(document.activeElement);
      if (max > 4 && !paused && time >= holdUntil) {
        el.scrollTop += elapsed * 0.018 * dir;
        if (el.scrollTop >= max - 1 && dir > 0) { dir = -1; holdUntil = time + 1500; }
        else if (el.scrollTop <= 0 && dir < 0) { dir = 1; holdUntil = time + 1500; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <section className="flex min-h-0 flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-label="Menu">
      <div className="flex items-baseline justify-between"><h2 className="text-sm font-extrabold uppercase tracking-[0.25em] text-white/85">Our menu</h2><span className="text-xs text-sky-300/80">Freshly prepared to order</span></div>
      <div ref={box} className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain [scrollbar-width:none]">
        {board.menu.map((g) => (
          <div key={g.name}>
            <div className="mb-2 flex items-center gap-3"><h3 className="text-lg font-extrabold uppercase tracking-wider text-orange-400">{g.name}</h3><span className="h-px flex-1 bg-white/10" /></div>
            <ul className="space-y-2">
              {g.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#101a4a]/60 p-2.5">
                  {i.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={i.imageUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                    : <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-2xl text-sky-200"><LuUtensils aria-hidden /></div>}
                  <div className="min-w-0 flex-1"><div className="truncate text-base font-bold">{i.name}</div>{i.description ? <div className="line-clamp-2 text-xs text-white/60">{i.description}</div> : null}</div>
                  <div className="num shrink-0 text-base font-bold tabular-nums">{formatMoney(i.priceMinor, board.currency, { hideZeroDecimals: true, locale: board.locale })}</div>
                </li>))}
            </ul>
          </div>))}
        {!board.menu.length ? <p className="py-10 text-center text-white/45">Menu coming soon</p> : null}
      </div>
    </section>
  );
}
