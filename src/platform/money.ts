/**
 * Money is always an integer in the currency's minor unit (cents). Never a float.
 * Rates are integer basis points (bp): 16% = 1600.
 */
export type Minor = number;

const FRACTION_CACHE = new Map<string, number>();
export function currencyFractionDigits(currency: string): number {
  const hit = FRACTION_CACHE.get(currency);
  if (hit !== undefined) return hit;
  let digits = 2;
  try {
    digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch { /* unknown currency code: keep 2 */ }
  FRACTION_CACHE.set(currency, digits);
  return digits;
}

export function formatMoney(minor: Minor, currency: string, opts: { compact?: boolean; locale?: string; hideZeroDecimals?: boolean } = {}): string {
  const digits = currencyFractionDigits(currency);
  const value = minor / 10 ** digits;
  const hide = opts.hideZeroDecimals && Number.isInteger(value);
  return new Intl.NumberFormat(opts.locale ?? "en-KE", {
    style: "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    minimumFractionDigits: hide ? 0 : opts.compact ? 0 : digits,
    maximumFractionDigits: hide ? 0 : opts.compact ? 1 : digits,
  }).format(value);
}

/** "1,250.50" → 125050. Returns null for unparseable input. */
export function parseMoney(input: string, currency: string): Minor | null {
  const cleaned = input.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** currencyFractionDigits(currency));
}

/** Minor units to a plain decimal string for inputs: 125050 → "1250.50". */
export function minorToInput(minor: Minor, currency: string): string {
  const d = currencyFractionDigits(currency);
  return (minor / 10 ** d).toFixed(d);
}

/** Round-half-away-from-zero basis-point share of an amount. */
export function bpOf(amount: Minor, bp: number): Minor {
  return roundHalfAway((amount * bp) / 10_000);
}

export function roundHalfAway(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

export function bpToPercent(bp: number): number {
  return bp / 100;
}
export function percentToBp(percent: number): number {
  return Math.round(percent * 100);
}

/**
 * Splits `total` across `weights` so the parts always add up exactly
 * (largest-remainder method). Used to allocate discounts across lines.
 */
export function allocate(total: Minor, weights: number[]): Minor[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i]! += 1;
    remainder -= 1;
  }
  return floors;
}
