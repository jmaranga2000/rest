/**
 * Client IP behind N trusted reverse proxies. `X-Forwarded-For` is attacker-controlled on its LEFT side
 * (clients can send their own), so we count from the RIGHT, where our own proxies append. Taking the first
 * entry (as many apps do) lets anyone dodge IP rate limits by sending a fake header.
 */
export function clientIpFrom(get: (name: string) => string | null | undefined, hops: number): string | null {
  const real = get("x-real-ip")?.trim() || null;
  if (hops <= 0) return real;
  const parts = (get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const ip = parts.length >= hops ? parts[parts.length - hops] : parts[0];
  return ip || real;
}

const v4 = (ip: string): number | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.some((n) => n > 255) ? null : (((o[0]! << 24) | (o[1]! << 16) | (o[2]! << 8) | o[3]!) >>> 0);
};

/** Exact IP or IPv4 CIDR matching against a comma-separated allow-list. */
export function ipAllowed(ip: string | null, list: string): boolean {
  if (!ip) return false;
  const addr = v4(ip);
  for (const raw of list.split(",").map((x) => x.trim()).filter(Boolean)) {
    if (raw === ip) return true;
    const [base, bits] = raw.split("/");
    if (bits === undefined || addr === null) continue;
    const b = v4(base!); const n = Number(bits);
    if (b === null || !Number.isInteger(n) || n < 0 || n > 32) continue;
    const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
    if (((addr & mask) >>> 0) === ((b & mask) >>> 0)) return true;
  }
  return false;
}
