import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

function derive(secret: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p, maxmem: 128 * n * r * 2 };
  return new Promise((resolve, reject) => {
    scrypt(secret.normalize("NFKC"), salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** scrypt (memory-hard, built into Node — no native dependency). Format: scrypt$N$r$p$salt$hash */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(secret, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
  // Always do comparable work, even for unknown users, to avoid a timing oracle.
  const target = stored && stored.startsWith("scrypt$") ? stored : DUMMY_HASH;
  const [, n, r, p, saltB64, hashB64] = target.split("$");
  const expected = Buffer.from(hashB64 ?? "", "base64url");
  const key = await derive(secret, Buffer.from(saltB64 ?? "", "base64url"), Number(n), Number(r), Number(p));
  const ok = key.length === expected.length && timingSafeEqual(key, expected);
  return ok && target === stored;
}

// A valid-format hash of a random value; used only to equalise timing.
const DUMMY_HASH = `scrypt$${N}$${R}$${P}$AAAAAAAAAAAAAAAAAAAAAA$${Buffer.alloc(KEYLEN).toString("base64url")}`;

export const PASSWORD_MIN_LENGTH = 10;

/** Basic strength policy: length plus not being trivially common. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (/^(.)\1+$/.test(password)) return "Choose a less repetitive password.";
  const common = ["password", "123456789", "qwertyuiop", "restaurant", "letmein123"];
  if (common.some((c) => password.toLowerCase().includes(c))) return "That password is too easy to guess.";
  return null;
}

export const PIN_PATTERN = /^\d{4,6}$/;

export { MAXMEM as _MAXMEM };
