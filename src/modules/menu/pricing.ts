export function effectivePrice(p: { basePriceMinor: number; branchPriceMinor: number | null }): number {
  return p.branchPriceMinor ?? p.basePriceMinor;
}
