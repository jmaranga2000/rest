import { requirePage } from "@/platform/http/request";
import { activeBranchOrThrow } from "@/platform/rbac/guard";
import { byIds } from "@/platform/db";
import { listStock, listSuppliers } from "@/modules/inventory/service";
import { InventoryPage, type InvTab } from "@/modules/inventory/views/InventoryPage";
export const metadata = { title: "Inventory" };
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const ctx = await requirePage({ permission: "inventory.view", feature: "inventory" });
  const branch = activeBranchOrThrow(ctx);
  const sp = await searchParams;
  const tab: InvTab = sp.tab === "low" || sp.tab === "recipes" ? sp.tab : "stock";
  const [rows, suppliers] = await Promise.all([listStock(ctx, branch.id, { q: sp.q }), listSuppliers(ctx)]);
  let products: { id: string; name: string; category: string }[] = [];
  const recipes: Record<string, { itemId: string; qtyMilli: number }[]> = {};
  if (tab === "recipes") {
    const docs = await ctx.db.col<{ id: string; name: string; categoryId: string }>("products").find({ orgId: ctx.org.id, isActive: true });
    const cats = await byIds<{ id: string; name: string }>(ctx.db, "menuCategories", ctx.org.id, docs.map((d) => d.categoryId));
    products = docs.map((p) => ({ id: p.id, name: p.name, category: cats.get(p.categoryId)?.name ?? "" })).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    const lines = await ctx.db.col<{ id: string; productId: string; itemId: string; qtyMilli: number }>("recipeLines").find({ orgId: ctx.org.id }, { sort: { productId: 1, itemId: 1 } });
    for (const r of lines) (recipes[r.productId] ??= []).push({ itemId: r.itemId, qtyMilli: Number(r.qtyMilli) });
  }
  return <InventoryPage rows={rows} tab={tab} branchId={branch.id} branchName={branch.name} currency={ctx.org.currency} suppliers={suppliers.filter((s) => s.isActive)} products={products} recipes={recipes} can={{ manage: ctx.permissions.has("inventory.manage"), adjust: ctx.permissions.has("inventory.adjust") }} />;
}
