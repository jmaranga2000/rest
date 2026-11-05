import Link from "next/link";
import type { ReactNode } from "react";
import { LuArrowDownRight, LuArrowUpRight, LuChevronLeft, LuChevronRight, LuCircleAlert, LuCircleCheck, LuInfo, LuTriangleAlert } from "react-icons/lu";
import { cn } from "./cn";
import { Button } from "./Button";
import type { Tone } from "./Badge";

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-1.5 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <LuChevronLeft className="size-4" aria-hidden />{back.label}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2 text-xl text-muted">{icon}</div> : null}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, delta, icon }: { label: string; value: ReactNode; hint?: ReactNode; delta?: { pct: number | null; goodWhenUp?: boolean }; icon?: ReactNode }) {
  const d = delta?.pct;
  const good = d == null ? null : (delta?.goodWhenUp ?? true) ? d >= 0 : d <= 0;
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
        <span>{label}</span>
        {icon ? <span className="text-base text-subtle">{icon}</span> : null}
      </div>
      <div className="num mt-1.5 text-2xl font-semibold tracking-tight text-fg">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        {d != null ? (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-success" : "text-danger")}>
            {d >= 0 ? <LuArrowUpRight className="size-3.5" aria-hidden /> : <LuArrowDownRight className="size-3.5" aria-hidden />}
            {Math.abs(d).toFixed(1)}%
          </span>
        ) : null}
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  );
}

const alertStyles: Record<Exclude<Tone, "neutral" | "primary">, { box: string; icon: ReactNode }> = {
  info: { box: "bg-info-soft text-info", icon: <LuInfo /> },
  success: { box: "bg-success-soft text-success", icon: <LuCircleCheck /> },
  warning: { box: "bg-warning-soft text-warning", icon: <LuTriangleAlert /> },
  danger: { box: "bg-danger-soft text-danger", icon: <LuCircleAlert /> },
};
export function Alert({ tone = "info", title, children, action }: { tone?: keyof typeof alertStyles; title?: string; children?: ReactNode; action?: ReactNode }) {
  const s = alertStyles[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-lg px-4 py-3 text-sm", s.box)}>
      <span className="mt-0.5 shrink-0 text-base" aria-hidden>{s.icon}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-fg/80")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Avatar({ name, color = "#4f46e5", size = 32 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>{initials || "?"}</span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse-soft rounded-md bg-surface-3", className)} />;
}

export function Tabs({ items }: { items: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            t.active ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg")}>
          {t.label}
          {t.count != null ? <span className="ml-1.5 rounded-full bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (p: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
      <span>Page {page} of {pageCount}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" href={hrefFor(Math.max(1, page - 1))} disabled={page <= 1} icon={<LuChevronLeft className="size-4" />}>Prev</Button>
        <Button variant="outline" size="sm" href={hrefFor(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>Next<LuChevronRight className="size-4" /></Button>
      </div>
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {items.map((i) => (
        <div key={i.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted">{i.label}</dt>
          <dd className="num text-right font-medium text-fg">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
