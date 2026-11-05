/**
 * Stock quantities are integer THOUSANDTHS ("milli") of an item's base unit (g | ml | pcs).
 * 1 kg = 1_000 g = 1_000_000 milli. People type kg / l / pcs, so these helpers convert both ways
 * with integer rounding only at the edge.
 */
export type BaseUnit = "g" | "ml" | "pcs";
export type DisplayUnit = "g" | "kg" | "ml" | "l" | "pcs";

export const BASE_UNITS: readonly BaseUnit[] = ["g", "ml", "pcs"];
export const BASE_UNIT_LABEL: Record<BaseUnit, string> = { g: "Weight (g)", ml: "Volume (ml)", pcs: "Pieces" };

const FACTOR: Record<DisplayUnit, number> = { g: 1, kg: 1000, ml: 1, l: 1000, pcs: 1 };
const BASE_OF: Record<DisplayUnit, BaseUnit> = { g: "g", kg: "g", ml: "ml", l: "ml", pcs: "pcs" };

/** Units a person may type a quantity in, for an item stored in `base`. */
export const unitsFor = (base: BaseUnit): DisplayUnit[] => (base === "g" ? ["kg", "g"] : base === "ml" ? ["l", "ml"] : ["pcs"]);
export const defaultDisplayUnit = (base: BaseUnit): DisplayUnit => unitsFor(base)[0]!;
export const isDisplayUnit = (v: string): v is DisplayUnit => v in FACTOR;
export const baseOf = (u: DisplayUnit): BaseUnit => BASE_OF[u];

/** "12.5" in kg → 12_500_000 milli-grams-units. Returns null when not a non-negative number. */
export function parseQty(text: string | number, unit: DisplayUnit): number | null {
  const raw = typeof text === "number" ? String(text) : text.trim().replace(/,/g, "");
  if (raw === "" || !/^\d*\.?\d+$|^\d+\.?$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * FACTOR[unit] * 1000);
}

/** Milli → decimal number in the given display unit (for form inputs). */
export function qtyToNumber(milli: number, unit: DisplayUnit): number {
  return Math.round((milli / 1000 / FACTOR[unit]) * 1000) / 1000;
}

const trim = (n: number) => String(Math.round(n * 1000) / 1000);

/** Human friendly: 1_500_000 (g) → "1.5 kg", 250_000 (g) → "250 g", 3_000 (pcs) → "3 pcs". */
export function formatQty(milli: number, base: BaseUnit): string {
  const amount = milli / 1000;
  if (base === "g") return Math.abs(amount) >= 1000 ? `${trim(amount / 1000)} kg` : `${trim(amount)} g`;
  if (base === "ml") return Math.abs(amount) >= 1000 ? `${trim(amount / 1000)} l` : `${trim(amount)} ml`;
  return `${trim(amount)} pcs`;
}

/** Same, but always in the item's default display unit (columns that should line up). */
export function formatQtyFixed(milli: number, base: BaseUnit): string {
  const u = defaultDisplayUnit(base);
  return `${trim(qtyToNumber(milli, u))} ${u}`;
}

/** Minor currency units per one default display unit (per kg / l / pcs) from a stock value. */
export function costPerDisplayUnit(valueMinor: number, qtyMilli: number, base: BaseUnit): number | null {
  if (qtyMilli <= 0) return null;
  const units = qtyToNumber(qtyMilli, defaultDisplayUnit(base));
  return units > 0 ? Math.round(valueMinor / units) : null;
}

/** (a × b) ÷ c rounded half-away-from-zero, exact for values beyond 2^53 (uses BigInt). */
export function mulDiv(a: number, b: number, c: number): number {
  if (c === 0) return 0;
  const num = BigInt(Math.trunc(a)) * BigInt(Math.trunc(b));
  const den = BigInt(Math.trunc(c));
  const neg = (num < 0n) !== (den < 0n);
  const absN = num < 0n ? -num : num;
  const absD = den < 0n ? -den : den;
  const q = (absN * 2n + absD) / (2n * absD);
  return Number(neg ? -q : q);
}
