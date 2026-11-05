import { requirePage } from "@/platform/http/request";
import { activeBranchOrThrow } from "@/platform/rbac/guard";
import { getCatalog } from "@/modules/menu/service";
import { currentShift, listActiveRewards, listOpenOrders, listTables } from "@/modules/orders/service";
import { PosTerminal } from "@/modules/orders/views/PosTerminal";

export const metadata = { title: "POS" };

export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const ctx = await requirePage({ permission: "orders.create", feature: "pos" }, "/pos");
  const branch = activeBranchOrThrow(ctx);
  const sp = await searchParams;
  const [catalog, tables, orders, shift, rewards] = await Promise.all([getCatalog(ctx, { branchId: branch.id }), listTables(ctx, branch.id), listOpenOrders(ctx, branch.id), currentShift(ctx, branch.id), listActiveRewards(ctx)]);
  const has = (p: Parameters<typeof ctx.permissions.has>[0]) => ctx.permissions.has(p);
  return <PosTerminal branchId={branch.id} branchName={branch.name} currency={ctx.org.currency} catalog={catalog} tables={tables} orders={orders} activeOrderId={orders.some((o) => o.id === sp.order) ? sp.order ?? null : null}
    orderTypes={ctx.settings.orderTypes} paymentMethods={ctx.settings.paymentMethods} hasOpenShift={!!shift} requireShift={ctx.settings.requireShiftForCash} rewards={rewards} userName={ctx.userName}
    can={{ create: has("orders.create"), discount: has("orders.discount"), void: has("orders.void"), pay: has("payments.collect"), customers: has("orders.edit") }} />;
}
