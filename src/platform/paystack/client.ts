import { createHmac } from "node:crypto";
import { safeEqual } from "../crypto";
import { AppError } from "../errors";

/**
 * Minimal Paystack REST client (https://paystack.com/docs/api). No SDK: three endpoints and a signature check.
 * Amounts are in the currency's smallest unit, which is what this app stores everywhere.
 * `fetch` is injectable so tests never touch the network.
 */
const BASE = "https://api.paystack.co";

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
let fetchImpl: FetchLike = (url, init) => fetch(url, init) as never;
export function __setPaystackFetchForTests(f: FetchLike | null): void { fetchImpl = f ?? ((url, init) => fetch(url, init) as never); }

export class PaystackError extends AppError {
  constructor(message: string) { super("PAYMENT_GATEWAY", message, 502); }
}

export const PAYSTACK_CURRENCIES = ["NGN", "GHS", "ZAR", "KES", "USD", "XOF", "EGP", "RWF"] as const;

export type PaystackKeys = { secretKey: string };
export const isSecretKey = (k: string) => /^sk_(test|live)_[A-Za-z0-9]{8,}$/.test(k);
export const isPublicKey = (k: string) => /^pk_(test|live)_[A-Za-z0-9]{8,}$/.test(k);
export const keyMode = (k: string): "test" | "live" => (k.includes("_live_") ? "live" : "test");

async function call<T>(secretKey: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res;
  try {
    res = await fetchImpl(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch {
    throw new PaystackError("Could not reach Paystack. Try again in a moment.");
  }
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !json?.status) throw new PaystackError(json?.message ? `Paystack: ${json.message}` : `Paystack returned an error (${res.status}).`);
  return json.data as T;
}

export interface InitInput { email: string; amountMinor: number; currency: string; reference: string; callbackUrl: string; metadata?: Record<string, unknown>; channels?: string[] }
export interface InitResult { authorization_url: string; access_code: string; reference: string }
export const initializeTransaction = (secretKey: string, i: InitInput) =>
  call<InitResult>(secretKey, "POST", "/transaction/initialize", {
    email: i.email, amount: i.amountMinor, currency: i.currency, reference: i.reference, callback_url: i.callbackUrl, metadata: i.metadata,
    ...(i.channels?.length ? { channels: i.channels } : {}),
  });

export interface VerifyResult { status: string; reference: string; amount: number; currency: string; paid_at?: string | null; channel?: string; gateway_response?: string; id?: number }
export const verifyTransaction = (secretKey: string, reference: string) => call<VerifyResult>(secretKey, "GET", `/transaction/verify/${encodeURIComponent(reference)}`);

/** Cheap authenticated call used by "Test connection": succeeds only for a valid secret key. */
export const checkKey = async (secretKey: string): Promise<void> => { await call<unknown>(secretKey, "GET", "/balance"); };

/** Paystack signs the raw request body with HMAC-SHA512 of the secret key (header `x-paystack-signature`). */
export function verifyWebhookSignature(secretKey: string, rawBody: string, signature: string | null | undefined): boolean {
  if (!signature) return false;
  return safeEqual(createHmac("sha512", secretKey).update(rawBody).digest("hex"), signature.toLowerCase());
}
