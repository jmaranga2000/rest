import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Secrets that must be recoverable (a restaurant's Paystack secret key) are encrypted at rest with
 * AES-256-GCM. The key is derived from APP_SECRET, so rotating APP_SECRET makes stored keys unreadable:
 * owners would have to re-enter them. Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
const key = () => createHmac("sha256", env().APP_SECRET).update("restaurant-os:secret-box:v1").digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(boxed: string): string {
  const [v, iv, tag, ct] = boxed.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unreadable stored secret");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
