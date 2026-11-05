import { requirePage } from "@/platform/http/request";
import { listCustomers } from "@/modules/customers/service";
import { CustomersPage } from "@/modules/customers/views/CustomersPage";

export const metadata = { title: "Customers" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const ctx = await requirePage({ permission: "customers.view", feature: "customers" });
  const sp = await searchParams;
  const data = await listCustomers(ctx, { q: sp.q, page: Number(sp.page) || 1, includeInactive: true });
  return <CustomersPage data={data} q={sp.q} currency={ctx.org.currency} timezone={ctx.org.timezone} loyaltyEnabled={ctx.settings.loyaltyEnabled} canManage={ctx.permissions.has("customers.manage")} />;
}
