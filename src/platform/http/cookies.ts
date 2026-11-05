import { cookies, headers } from "next/headers";
import { env, isProd } from "../env";
import { clientIpFrom } from "../security/ip";

// "__Host-" cookies are origin-bound, HTTPS-only and path "/" — the strongest cookie scope.
const prefix = () => (isProd() ? "__Host-" : "");
export const SESSION_COOKIE = () => `${prefix()}ros_session`;
export const PLATFORM_COOKIE = () => `${prefix()}ros_platform`;
export const TERMINAL_COOKIE = () => `${prefix()}ros_terminal`;

const base = () => ({ httpOnly: true, secure: isProd(), sameSite: "lax" as const, path: "/" });

export async function setCookie(name: string, value: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(name, value, { ...base(), expires: expiresAt });
}
export async function readCookie(name: string): Promise<string | undefined> {
  return (await cookies()).get(name)?.value;
}
export async function clearCookie(name: string): Promise<void> {
  (await cookies()).set(name, "", { ...base(), maxAge: 0 });
}

export async function clientMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return { ip: clientIpFrom((n) => h.get(n), env().TRUSTED_PROXY_HOPS), userAgent: h.get("user-agent") };
}
