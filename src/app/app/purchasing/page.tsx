import { requirePage } from "@/platform/http/request";
import { activeBranchOrThrow } from "@/platform/rbac/guard";
import { listPurchaseOrders, listStock, listSuppliers } from "@/modules/inventory/service";
import { PurchasingPage } from "@/modules/inventory/views/PurchasingPage";
export const metadata = { title: "Purchasing" };
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePage({ permission: "purchasing.view", feature: "purchasing" });
  const branch = activeBranchOrThrow(ctx);
  const sp = await searchParams;
  const [orders, suppliers, items] = await Promise.all([listPurchaseOrders(ctx, branch.id), listSuppliers(ctx), listStock(ctx, branch.id)]);
  return <PurchasingPage tab={sp.tab === "suppliers" ? "suppliers" : "orders"} orders={orders} suppliers={suppliers} items={items} branchId={branch.id} currency={ctx.org.currency} timezone={branch.timezone || ctx.org.timezone}
    can={{ manage: ctx.permissions.has("purchasing.manage"), receive: ctx.permissions.has("purchasing.receive") }} />;
}
