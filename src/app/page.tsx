import Link from "next/link";
import { LuChefHat, LuChartColumn, LuCheck, LuPackage, LuShieldCheck, LuShoppingBag, LuStore, LuUtensilsCrossed, LuWallet } from "react-icons/lu";
import { getCtx } from "@/platform/http/request";
import { homeForRole } from "@/modules/identity/auth.service";
import { DEFAULT_PLANS } from "@/platform/tenancy/plans";
import { formatMoney } from "@/platform/money";
import { buttonClass } from "@/ui/Button";

export const dynamic = "force-dynamic";
const FEATURES = [
  { icon: LuShoppingBag, title: "A till staff actually like", text: "Touch POS for dine-in, takeaway and delivery. Split payments, M-Pesa references, discounts with reasons, offline-safe retries." },
  { icon: LuChefHat, title: "Kitchen display", text: "Tickets reach each station the moment they're sent, with late-order alerts and one-tap bumping." },
  { icon: LuPackage, title: "Stock that stays honest", text: "Recipes deduct ingredients on sale, purchase orders book deliveries at real cost, low stock flags itself." },
  { icon: LuWallet, title: "Cash you can reconcile", text: "Open and close drawer shifts, record pay-ins and pay-outs, and see the variance — every time." },
  { icon: LuChartColumn, title: "Reports that answer questions", text: "Sales, best sellers, payment mix, staff performance and busy hours, exportable to CSV." },
  { icon: LuStore, title: "Built for groups", text: "Per-branch menus, tables and stock, role-based access, a full audit trail and a customer-facing order board." },
];

export default async function Home() {
  const ctx = await getCtx();
  const plans = DEFAULT_PLANS.filter((p) => p.isPublic);
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2">
        <Link href="/" className="flex items-center gap-2.5 font-semibold"><span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-fg"><LuUtensilsCrossed className="size-5" /></span>Restaurant OS</Link>
        <nav className="flex flex-wrap items-center justify-end gap-2">
          <Link className={buttonClass("outline", "md")} href="/platform"><LuShieldCheck className="size-4" aria-hidden /><span className="hidden sm:inline">Operator console</span><span className="sm:hidden">Platform</span></Link>
          {ctx ? <Link className={buttonClass("primary", "md")} href={homeForRole(ctx.roleKey)}>Open app</Link> : <><Link className={buttonClass("ghost", "md")} href="/login">Sign in</Link><Link className={buttonClass("primary", "md")} href="/register">Start free trial</Link></>}
        </nav>
      </header>
      <main>
        <section className="mx-auto max-w-4xl px-5 pb-16 pt-14 text-center sm:pt-24">
          <p className="mb-4 inline-block rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary">14-day free trial · no card needed</p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">Run service, stock and sales from one calm screen.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">Point of sale, kitchen display, inventory, purchasing, loyalty and reporting for restaurants, cafés and bars, built around how Kenyan kitchens actually work.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3"><Link className={buttonClass("primary", "xl")} href="/register">Start free trial</Link><Link className={buttonClass("outline", "xl")} href="/login">Sign in</Link></div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-5 px-5 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (<div key={f.title} className="rounded-xl border border-line bg-surface p-6 shadow-card"><span className="mb-4 grid size-10 place-items-center rounded-lg bg-primary-soft text-primary"><f.icon className="size-5" /></span><h2 className="font-semibold">{f.title}</h2><p className="mt-2 text-sm text-muted">{f.text}</p></div>))}
        </section>
        <section id="pricing" className="border-t border-line bg-surface py-20"><div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Simple pricing</h2><p className="mt-2 text-center text-muted">Every plan starts with a free trial. Change or cancel any time.</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">{plans.map((p) => (
            <div key={p.code} className={`flex flex-col rounded-xl border p-6 ${p.code === "professional" ? "border-primary ring-1 ring-primary" : "border-line"}`}>
              <h3 className="text-lg font-semibold">{p.name}</h3><div className="mt-2"><span className="num text-3xl font-semibold">{formatMoney(p.priceMinor, p.currency, { hideZeroDecimals: true })}</span><span className="text-sm text-muted"> / {p.billingInterval}</span></div>
              <p className="mt-2 text-sm text-muted">{p.description}</p>
              <ul className="my-5 space-y-2 text-sm">{p.highlights.map((h) => <li key={h} className="flex gap-2"><LuCheck className="mt-0.5 size-4 shrink-0 text-success" />{h}</li>)}</ul>
              <Link href="/register" className={`mt-auto ${buttonClass(p.code === "professional" ? "primary" : "outline", "md", "w-full")}`}>Start free trial</Link></div>))}</div></div></section>
      </main>
      <footer className="border-t border-line py-8 text-center text-sm text-muted">© {new Date().getFullYear()} Restaurant OS</footer>
    </div>);
}
