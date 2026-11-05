import { createHmac } from "node:crypto";
import { env } from "../env";
import { newSecret } from "../ids";

/** Tokens are random and opaque; only an HMAC of them is stored, so a DB leak can't be replayed. */
export function hashToken(token: string): string {
  return createHmac("sha256", env().APP_SECRET).update(token).digest("base64url");
}

export function newToken(): { token: string; hash: string } {
  const token = newSecret(32);
  return { token, hash: hashToken(token) };
}
