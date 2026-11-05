import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full min-w-max border-collapse text-left text-sm", className)} {...rest} />
    </div>
  );
}
export const THead = (p: HTMLAttributes<HTMLTableSectionElement>) => <thead className="border-b border-line bg-surface-2/60" {...p} />;
export const TBody = (p: HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y divide-line" {...p} />;
export const TR = ({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) => <tr className={cn("transition-colors hover:bg-surface-2/50", className)} {...p} />;
export const TH = ({ className, align, ...p }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "right" }) => (
  <th className={cn("px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted", align === "right" && "text-right", className)} {...p} />
);
export const TD = ({ className, align, ...p }: TdHTMLAttributes<HTMLTableCellElement> & { align?: "right" }) => (
  <td className={cn("px-4 py-3 align-middle text-fg", align === "right" && "text-right tabular-nums", className)} {...p} />
);
