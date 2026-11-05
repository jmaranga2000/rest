import { z } from "zod";

/** Checkbox/switch from FormData ("on" | "true" | absent) or JSON (boolean). */
export const zBool = z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean());

/** Integer minor-unit amount from a form string ("125050") or number. Empty → undefined. */
export const zMinor = z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number({ invalid_type_error: "Enter an amount." }).int().min(0, "Amount can't be negative.").max(100_000_000_00));

export const zInt = (min = 0, max = 1_000_000) => z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number({ invalid_type_error: "Enter a number." }).int().min(min).max(max));

/** Empty string → undefined, so optional text fields validate cleanly. */
export const zOptText = (max = 500) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

export const zText = (label: string, max = 120) => z.string({ required_error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);

export const zId = z.string().min(1).max(64);

/** A JSON-encoded field (arrays/objects posted as one hidden input). */
export function zJson<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try { return JSON.parse(v); } catch { return undefined; }
  }, schema);
}

/** String list from repeated form keys `name[]` or a single value. */
export const zStringList = z.preprocess((v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(z.string()));
