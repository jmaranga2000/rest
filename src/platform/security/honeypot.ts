/**
 * Form honeypot + timing trap. Real browsers never fill the hidden `_hp` field and take more than a second to type
 * credentials; scripted form-fillers fail one or both. Neither check is visible to people, and neither reveals itself in errors.
 */
export const HONEYPOT_FIELD = "_hp";
export const TIME_FIELD = "_t";
export const MIN_FILL_MS = 1200;

export type HoneypotVerdict = "ok" | "filled" | "too_fast" | "missing";

export function checkHoneypot(raw: unknown, now: number = Date.now()): HoneypotVerdict {
  const get = (k: string): unknown => {
    if (typeof FormData !== "undefined" && raw instanceof FormData) return raw.get(k);
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>)[k] : undefined;
  };
  const hp = get(HONEYPOT_FIELD);
  if (typeof hp === "string" && hp.trim() !== "") return "filled";
  const t = Number(get(TIME_FIELD));
  if (!Number.isFinite(t) || t <= 0) return "missing";
  const age = now - t;
  if (age < 0 || age > 24 * 3600_000) return "missing";
  if (age < MIN_FILL_MS) return "too_fast";
  return "ok";
}