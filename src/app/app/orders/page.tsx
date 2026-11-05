import { requirePage } from "@/platform/http/request";
import { listOrders } from "@/modules/orders/service";
import { OrdersPage, type OrdersTab } from "@/modules/orders/views/OrdersPage";

export const metadata = { title: "Orders" };
export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const ctx = await requirePage({ permission: "orders.view" });
  const sp = await searchParams;
  const tab = (["open", "closed", "void"].includes(sp.status ?? "") ? sp.status : "all") as OrdersTab;
  const orders = await listOrders(ctx, { status: tab === "all" ? undefined : tab, q: sp.q, limit: 200 });
  return <OrdersPage orders={orders} tab={tab} q={sp.q} currency={ctx.org.currency} timezone={ctx.activeBranch?.timezone || ctx.org.timezone} />;
}
