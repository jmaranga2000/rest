"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LuArmchair, LuArrowUpRight, LuBedDouble, LuChartColumn, LuChefHat, LuCreditCard, LuGift, LuLayoutDashboard, LuLock,
  LuPackage, LuReceipt, LuScrollText, LuSettings, LuShieldCheck, LuShoppingBag, LuStore, LuTablet, LuTruck, LuTv,
  LuUserCog, LuUsers, LuUtensilsCrossed, LuWallet, type IconType,
} from "react-icons/lu";
import { cn } from "../cn";
import type { NavGroup, NavIconName, NavItem } from "./nav";

type Group = Omit<NavGroup, "items"> & { items: (NavItem & { locked: boolean })[] };

const ICONS: Record<NavIconName, IconType> = {
  armchair: LuArmchair,
  chart: LuChartColumn,
  chef: LuChefHat,
  "credit-card": LuCreditCard,
  gift: LuGift,
  dashboard: LuLayoutDashboard,
  package: LuPackage,
  receipt: LuReceipt,
  scroll: LuScrollText,
  settings: LuSettings,
  shield: LuShieldCheck,
  store: LuStore,
  tablet: LuTablet,
  truck: LuTruck,
  tv: LuTv,
  "user-cog": LuUserCog,
  users: LuUsers,
  utensils: LuUtensilsCrossed,
  wallet: LuWallet,
  "shopping-bag": LuShoppingBag,
  bed: LuBedDouble,
};

export function SidebarNav({ groups, onNavigate }: { groups: Group[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(item.href);
              const Icon = ICONS[item.icon];
              const href = item.locked ? `/app/upgrade?feature=${item.feature}` : item.href;
              return (
                <li key={item.href}>
                  <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                    className={cn("group flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors",
                      active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-fg",
                      item.locked && "opacity-70")}>
                    <Icon className="size-[18px] shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.locked ? <LuLock className="size-3.5 text-subtle" aria-label="Upgrade required" /> : item.external ? <LuArrowUpRight className="size-3.5 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
