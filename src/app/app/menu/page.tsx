import { requirePage } from "@/platform/http/request";
import { getCatalog } from "@/modules/menu/service";
import { MenuPage, type MenuTab } from "@/modules/menu/views/MenuPage";

export const metadata = { title: "Menu" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; category?: string }> }) {
  const ctx = await requirePage({ anyPermission: ["menu.view", "menu.manage"] });
  const sp = await searchParams;
  const tab = (["items", "categories", "modifiers", "stations"].includes(sp.tab ?? "") ? sp.tab : "items") as MenuTab;
  const catalog = await getCatalog(ctx, { includeInactive: true });
  return <MenuPage catalog={catalog} tab={tab} q={sp.q} category={sp.category} currency={ctx.org.currency} branchId={ctx.activeBranch?.id ?? null} branchName={ctx.activeBranch?.name ?? null}
    can={{ manage: ctx.permissions.has("menu.manage"), availability: ctx.permissions.has("menu.availability") }} />;
}
