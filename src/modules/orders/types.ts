export type OrderStatus = "open" | "closed" | "void";
export type ItemStatus = "held" | "sent" | "preparing" | "ready" | "served" | "void";

/** Legal kitchen progressions for a single item. */
export const ITEM_NEXT: Record<ItemStatus, ItemStatus[]> = {
  held: ["sent", "void"], sent: ["preparing", "void"], preparing: ["ready", "void"], ready: ["served", "void"], served: [], void: [],
};
export const canMoveItem = (from: ItemStatus, to: ItemStatus): boolean => ITEM_NEXT[from].includes(to);

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = { held: "Not sent", sent: "Sent", preparing: "Preparing", ready: "Ready", served: "Served", void: "Void" };

/** What a customer-facing board shows for an order, from its live items. */
export function orderProgress(statuses: ItemStatus[]): "none" | "preparing" | "ready" {
  const live = statuses.filter((s) => s !== "void" && s !== "held");
  if (!live.length) return "none";
  if (live.every((s) => s === "ready" || s === "served")) return "ready";
  return "preparing";
}

export interface OrderItemView {
  id: string; productId: string; name: string; variantName: string | null; qty: number; unitPriceMinor: number; modifiersMinor: number; lineTotalMinor: number;
  note: string | null; status: ItemStatus; round: number; stationId: string | null; modifiers: { name: string; priceMinor: number }[];
  sentAt: string | null; readyAt: string | null; voidReason: string | null;
}
export interface PaymentView { id: string; method: string; amountMinor: number; tenderedMinor: number | null; changeMinor: number; tipMinor: number; reference: string | null; refundOfId: string | null; reason: string | null; createdAt: string; createdByName: string | null }
export interface OrderView {
  id: string; branchId: string; number: string; seq: number; businessDate: string; type: string; status: OrderStatus; tableId: string | null; tableLabel: string | null;
  customerId: string | null; customerName: string | null; guests: number | null; notes: string | null; currency: string;
  subtotalMinor: number; discountMinor: number; discountKind: "percent" | "amount" | null; discountValue: number | null; discountReason: string | null; rewardDiscountMinor: number; rewardPoints: number;
  serviceChargeMinor: number; taxMinor: number; totalMinor: number; paidMinor: number; tipMinor: number; taxInclusive: boolean; taxRateBp: number;
  openedByName: string | null; openedAt: string; closedAt: string | null; voidedAt: string | null; voidReason: string | null; version: number;
  items: OrderItemView[]; payments: PaymentView[];
}
