import type { ReactNode } from "react";
import { getPlatformCtx } from "@/modules/platform-admin/request";
import { PlatformShell } from "@/modules/platform-admin/views/PlatformViews";
import { PlatformLogout } from "./LogoutButton";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: ReactNode }) {
  const ctx = await getPlatformCtx();
  if (!ctx) return <>{children}</>; // the login page; every other page calls requirePlatformPage()
  return <PlatformShell name={ctx.name} logout={<PlatformLogout />}>{children}</PlatformShell>;
}
