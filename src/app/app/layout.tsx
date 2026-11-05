import type { ReactNode } from "react";
import { AppShell } from "@/ui/shell/AppShell";
import { requirePage } from "@/platform/http/request";
import { logoutAction, switchBranchById } from "@/modules/identity/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requirePage();
  return <AppShell ctx={ctx} actions={{ switchBranch: switchBranchById, logout: logoutAction }}>{children}</AppShell>;
}
