import Link from "next/link";
import type { ReactNode } from "react";
import { LuShieldCheck, LuUtensilsCrossed } from "react-icons/lu";
import type { Ctx } from "@/platform/auth/context";
import { Alert } from "../misc";
import { Button } from "../Button";
import { visibleNav } from "./nav";
import { SidebarNav } from "./SidebarNav";
import { BranchSwitcher, MobileDrawer, UserMenu } from "./ShellControls";
import { DesktopSidebarLayout } from "./DesktopSidebarLayout";

export interface ShellActions {
  switchBranch: (branchId: string) => Promise<unknown>;
  logout: () => Promise<unknown>;
}

function Brand({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <Link href="/app" className="flex min-w-0 items-center gap-2.5">
      {logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logoUrl} alt="" className="size-8 rounded-lg object-cover" />
        : <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg"><LuUtensilsCrossed className="size-[18px]" aria-hidden /></span>}
      <span className="truncate text-[15px] font-semibold tracking-tight text-fg">{name}</span>
    </Link>
  );
}

function BillingBanner({ ctx }: { ctx: Pick<Ctx, "access" | "subscription" | "permissions"> }) {
  const canBill = ctx.permissions.has("billing.manage");
  const cta = canBill ? <Button size="sm" variant="outline" href="/app/billing">Choose a plan</Button> : null;
  const { reason, daysLeft } = ctx.access;
  if (reason === "trial_ending") return <Alert tone="warning" title={`Your free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`} action={cta}>Pick a plan to keep taking orders without interruption.</Alert>;
  if (reason === "trial_expired") return <Alert tone="danger" title="Your free trial has ended" action={cta}>The workspace is read-only until you choose a plan. Your data is safe.</Alert>;
  if (reason === "grace_period") return <Alert tone="warning" title="Payment overdue" action={cta}>Service continues for {daysLeft} more day{daysLeft === 1 ? "" : "s"}. After that the workspace becomes read-only.</Alert>;
  if (reason === "payment_overdue") return <Alert tone="danger" title="Subscription payment overdue" action={cta}>The workspace is read-only until the invoice is settled.</Alert>;
  return null;
}

/** The single authenticated frame for every back-office page. POS and KDS use their own full-screen layouts. */
export function AppShell({ ctx, actions, children, pathname }: { ctx: Ctx; actions: ShellActions; children: ReactNode; pathname?: string }) {
  void pathname;
  const groups = visibleNav(ctx.permissions, ctx.features);
  const brand = <Brand name={ctx.org.name} logoUrl={ctx.org.logoUrl} />;
  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hidden h-16 shrink-0 items-center px-4 lg:flex">{brand}</div>
      <div className="px-3 pb-3 pt-3 lg:pt-0">
        <BranchSwitcher branches={ctx.branches} activeId={ctx.activeBranch?.id ?? null} action={actions.switchBranch} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <SidebarNav groups={groups} />
        <div className="mt-5 border-t border-line pt-4">
          <Link href="/platform" className="flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg">
            <LuShieldCheck className="size-[18px] shrink-0" aria-hidden />
            <span>Operator console</span>
          </Link>
        </div>
      </div>
      <div className="shrink-0 border-t border-line p-3">
        <p className="mb-2 px-2 text-[11px] text-subtle">{ctx.plan.name} plan{ctx.subscription.status === "trialing" ? " · trial" : ""}</p>
        <UserMenu name={ctx.userName} role={ctx.roleName} color={ctx.userColor} logout={actions.logout} />
      </div>
    </div>
  );
  return (
    <DesktopSidebarLayout sidebar={sidebar}>
      <MobileDrawer brand={brand}>{sidebar}</MobileDrawer>
      <main className="min-w-0">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {ctx.access.reason !== "ok" ? <div className="mb-6"><BillingBanner ctx={ctx} /></div> : null}
          {children}
        </div>
      </main>
    </DesktopSidebarLayout>
  );
}
