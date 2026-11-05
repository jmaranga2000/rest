import { NextResponse, type NextRequest } from "next/server";
import { clientIpFrom, ipAllowed } from "@/platform/security/ip";

/**
 * Edge gate. Three jobs, all stateless:
 *  1. Per-request CSP with a nonce (no 'unsafe-inline' scripts), plus no-store on anything behind sign-in.
 *  2. Optional IP allow-list for the operator console (PLATFORM_ALLOWED_IPS).
 *  3. Bounce anonymous visitors from protected areas. Only checks that a session cookie EXISTS; real authentication
 *     and every permission check happen server-side against the database (platform/http/request.ts).
 */
const PROTECTED = ["/app", "/pos", "/kitchen", "/onboarding", "/platform"];

function csp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protectedArea = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const allow = process.env.PLATFORM_ALLOWED_IPS?.trim();
  if (allow && (pathname === "/platform" || pathname.startsWith("/platform/"))) {
    const ip = clientIpFrom((n) => req.headers.get(n), Number(process.env.TRUSTED_PROXY_HOPS ?? 1));
    if (!ipAllowed(ip, allow)) return new NextResponse("Not Found", { status: 404 }); // don't confirm the console exists
  }

  if (protectedArea && !pathname.startsWith("/platform/login")) {
    const has = req.cookies.has("ros_session") || req.cookies.has("__Host-ros_session") || req.cookies.has("ros_platform") || req.cookies.has("__Host-ros_platform");
    if (!has) {
      const to = pathname.startsWith("/platform") ? "/platform/login" : "/login";
      const url = new URL(to, req.url);
      if (to === "/login") url.searchParams.set("next", pathname + req.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }

  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const policy = csp(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy); // Next reads the nonce from the REQUEST header and applies it to its own scripts
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", policy);
  if (protectedArea) res.headers.set("Cache-Control", "no-store");
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
