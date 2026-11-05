import { randomBytes } from "node:crypto";

/**
 * Prefixed, time-sortable identifiers (ULID-style): `ord_01J8Z...`.
 * Sortable ids keep B-tree inserts append-mostly and make logs self-describing.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const ID_PREFIXES = {
  org: "org", branch: "brn", user: "usr", role: "rol", session: "ses", terminal: "trm", invite: "inv",
  category: "cat", station: "stn", product: "prd", image: "img", variant: "var", modGroup: "mgr", modOption: "mop",
  area: "area", table: "tbl", customer: "cus", reward: "rwd", loyalty: "lty",
  order: "ord", orderItem: "oit", payment: "pay", shift: "shf", cashMove: "cmv",
  invItem: "itm", movement: "mov", supplier: "sup", po: "po", poLine: "pol", count: "cnt", countLine: "cnl",
  slide: "sld", audit: "aud", plan: "pln", admin: "adm", planRequest: "prq", billing: "bil",
  roomType: "rmt", room: "rom", booking: "bkg",
} as const;
export type IdKind = keyof typeof ID_PREFIXES;

function encodeTime(ms: number): string {
  let out = "";
  let n = ms;
  for (let i = 0; i < 10; i += 1) {
    out = ALPHABET[n % 32]! + out;
    n = Math.floor(n / 32);
  }
  return out;
}

function encodeRandom(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i]! % 32];
  return out;
}

let lastMs = -1;
let lastRand: number[] = [];

/** Monotonic within a process: ids minted in the same millisecond still sort in creation order. */
export function newId(kind: IdKind, nowMs: number = Date.now()): string {
  if (nowMs === lastMs) {
    let i = lastRand.length - 1;
    while (i >= 0 && lastRand[i] === 31) { lastRand[i] = 0; i -= 1; }
    if (i >= 0) lastRand[i] = lastRand[i]! + 1;
  } else {
    lastMs = nowMs;
    lastRand = [...randomBytes(14)].map((b) => b % 32);
    lastRand[0] = lastRand[0]! % 16; // headroom so increments cannot overflow in practice
  }
  return `${ID_PREFIXES[kind]}_${encodeTime(nowMs)}${lastRand.map((n) => ALPHABET[n]).join("")}`;
}

/** Opaque URL-safe secret for sessions, invitations and display keys. */
export function newSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
