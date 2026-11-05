"use client";
import { useRunAction } from "@/ui/ActionForm";
import { setAvailabilityAction } from "../actions";
import { cn } from "@/ui/cn";

export function AvailabilityToggle({ branchId, productId, isAvailable, disabled }: { branchId: string; productId: string; isAvailable: boolean; disabled?: boolean }) {
  const { run, pending } = useRunAction();
  return (
    <button type="button" role="switch" aria-checked={isAvailable} disabled={disabled || pending} title={isAvailable ? "Available — click to mark sold out" : "Sold out — click to make available"}
      onClick={() => run(setAvailabilityAction, { branchId, productId, isAvailable: !isAvailable }, { success: isAvailable ? "Marked sold out" : "Back on the menu" })}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", isAvailable ? "bg-success" : "bg-line-strong")}>
      <span className={cn("absolute size-4 rounded-full bg-white shadow transition-transform", isAvailable ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}
