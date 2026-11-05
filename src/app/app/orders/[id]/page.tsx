import { notFound } from "next/navigation";
import { requirePage } from "@/platform/http/request";
import { NotFoundError } from "@/platform/errors";
import { getOrder } from "@/modules/orders/service";
import { OrderDetail } from "@/modules/orders/views/OrderDetail";

export const metadata = { title: "Order" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage({ permission: "orders.view" });
  const { id } = await params;
  const order = await getOrder(ctx, id).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const branch = ctx.branches.find((b) => b.id === order.branchId);
  return <OrderDetail order={order} orgName={ctx.org.name} branchName={branch?.name ?? ""} timezone={branch?.timezone || ctx.org.timezone} receiptHeader={ctx.settings.receiptHeader} receiptFooter={ctx.settings.receiptFooter} taxLabel={ctx.settings.taxLabel}
    can={{ void: ctx.permissions.has("orders.void"), refund: ctx.permissions.has("payments.refund") }} />;
}
