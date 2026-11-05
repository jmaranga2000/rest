/** Pre-formatted value that must be written verbatim (e.g. "-12.50" amounts); never formula-guarded. */
export type RawCell = { raw: string };
export type Cell = string | number | null | undefined | RawCell;

export const raw = (s: string): RawCell => ({ raw: s });

function encodeCell(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "object") return cell.raw;
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  // Spreadsheet formula injection: a text cell that starts with = + - @ (or tab / CR) is prefixed with an apostrophe.
  const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 CSV with CRLF line endings. No BOM. */
export function encodeCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(encodeCell).join(",")).join("\r\n") + "\r\n";
}
