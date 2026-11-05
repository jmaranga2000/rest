import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Semantic status → tone map used by every list so a status always looks the same. */
export const STATUS_TONE: Record<string, Tone> = {
  open: "info", closed: "success", void: "danger",
  held: "neutral", sent: "info", preparing: "warning", ready: "success", served: "neutral",
  active: "success", disabled: "neutral", suspended: "danger", trialing: "info", past_due: "warning", cancelled: "neutral",
  draft: "neutral", ordered: "info", partial: "warning", received: "success",
  pending: "warning", approved: "success", rejected: "danger", posted: "success",
};
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"} dot>{label ?? titleCase(status)}</Badge>;
}
