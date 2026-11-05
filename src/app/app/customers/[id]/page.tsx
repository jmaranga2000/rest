import { requirePage } from "@/platform/http/request";
import { getCustomerProfile } from "@/modules/customers/service";
import { CustomerProfile } from "@/modules/customers/views/CustomerProfile";

export const metadata = { title: "Customer" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePage({ permission: "customers.view", feature: "customers" });
  const data = await getCustomerProfile(ctx, id);
  return <CustomerProfile {...data} currency={ctx.org.currency} timezone={ctx.org.timezone} loyaltyEnabled={ctx.settings.loyaltyEnabled}
    canManage={ctx.permissions.has("customers.manage")} canAdjust={ctx.permissions.has("loyalty.manage") && ctx.features.has("loyalty")} />;
}
