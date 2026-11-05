import { allocate, bpOf, roundHalfAway } from "@/platform/money";

export interface PriceLine { unitMinor: number; qty: number; taxExempt: boolean }
export type DiscountSpec = { kind: "percent"; value: number } | { kind: "amount"; value: number } | null;
export interface PriceRules {
  taxRateBp: number;
  taxInclusive: boolean;
  /** 0 when no service charge applies to this order. */
  serviceChargeBp: number;
  serviceChargeTaxable: boolean;
}
export interface PriceResult {
  /** Gross sum of lines before discounts. */
  subtotalMinor: number;
  /** Manual + reward discount, capped at the subtotal. */
  discountMinor: number;
  serviceChargeMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * The one pricing function. Pure, integer-only and deterministic so the POS preview, the
 * server and the reports can never disagree.
 *
 *  1. discount (percent of subtotal, or fixed amount, plus loyalty reward) is capped at the subtotal
 *     and allocated across lines pro-rata (largest-remainder), so exempt/taxable mix stays exact;
 *  2. service charge applies to the discounted amount;
 *  3. tax-exclusive prices: tax is added on top of the taxable base;
 *     tax-inclusive prices: tax is the portion already inside the taxable base (total is unchanged).
 */
export function priceOrder(lines: PriceLine[], discount: DiscountSpec, rewardDiscountMinor: number, rules: PriceRules): PriceResult {
  const lineTotals = lines.map((l) => l.unitMinor * l.qty);
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const manual = !discount ? 0 : discount.kind === "percent" ? bpOf(subtotal, discount.value) : discount.value;
  const discountMinor = Math.min(subtotal, Math.max(0, manual + rewardDiscountMinor));
  const shares = allocate(discountMinor, lineTotals);
  const net = lineTotals.map((t, i) => t - (shares[i] ?? 0));
  const netTotal = net.reduce((a, b) => a + b, 0);
  const serviceChargeMinor = rules.serviceChargeBp > 0 ? bpOf(netTotal, rules.serviceChargeBp) : 0;
  const taxableNet = net.reduce((a, n, i) => a + (lines[i]!.taxExempt ? 0 : n), 0);
  const taxableBase = taxableNet + (rules.serviceChargeTaxable ? serviceChargeMinor : 0);

  let taxMinor: number;
  let totalMinor: number;
  if (rules.taxRateBp <= 0) {
    taxMinor = 0;
    totalMinor = netTotal + serviceChargeMinor;
  } else if (rules.taxInclusive) {
    taxMinor = roundHalfAway((taxableBase * rules.taxRateBp) / (10_000 + rules.taxRateBp));
    totalMinor = netTotal + serviceChargeMinor;
  } else {
    taxMinor = bpOf(taxableBase, rules.taxRateBp);
    totalMinor = netTotal + serviceChargeMinor + taxMinor;
  }
  return { subtotalMinor: subtotal, discountMinor, serviceChargeMinor, taxMinor, totalMinor };
}

/** Change due for a cash tender. */
export function changeDue(appliedMinor: number, tenderedMinor: number): number {
  return Math.max(0, tenderedMinor - appliedMinor);
}
