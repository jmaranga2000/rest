import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "soft" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover shadow-sm",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3",
  outline: "border border-line-strong bg-surface text-fg hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  soft: "bg-primary-soft text-primary hover:brightness-95",
  danger: "bg-danger text-white hover:brightness-110",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-sm gap-2 rounded-lg",
  xl: "h-14 px-6 text-base gap-2.5 rounded-xl", // touch targets for POS / KDS
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors select-none",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    variants[variant], sizes[size], extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", href, loading, icon, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  const content = (
    <>
      {loading ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </>
  );
  if (href) {
    return <Link href={href} className={buttonClass(variant, size, className)} aria-disabled={disabled || undefined}>{content}</Link>;
  }
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}

export function IconButton({ label, variant = "ghost", size = "md", className, children, ...rest }: Omit<ButtonProps, "icon" | "loading"> & { label: string }) {
  const box = size === "sm" ? "size-8" : size === "lg" || size === "xl" ? "size-11" : "size-10";
  return (
    <button type="button" aria-label={label} title={label} className={cn(buttonClass(variant, size, "!px-0"), box, className)} {...rest}>
      {children}
    </button>
  );
}
