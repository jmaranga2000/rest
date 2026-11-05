/**
 * Normalises phone numbers to E.164. Kenyan formats (0712345678, 712345678,
 * 254712345678, +254 712 345 678) become +254712345678. Other international
 * numbers must already carry a + or 00 prefix. Returns null if not plausible.
 */
export function normalisePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (!hasPlus && digits.startsWith("00")) return finish(digits.slice(2));
  if (hasPlus) return finish(digits);
  if (digits.startsWith("254") && digits.length === 12) return finish(digits);
  if (digits.startsWith("0") && digits.length === 10) return finish(`254${digits.slice(1)}`);
  if (digits.length === 9 && !digits.startsWith("0")) { digits = `254${digits}`; return finish(digits); }
  return null;
}

function finish(digits: string): string | null {
  if (digits.startsWith("254") && digits.length !== 12) return null;
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return `+${digits}`;
}
