import { requirePage } from "@/platform/http/request";
import { listRewards } from "@/modules/customers/service";
import { LoyaltyPage } from "@/modules/customers/views/LoyaltyPage";

export const metadata = { title: "Loyalty" };

export default async function Page() {
  const ctx = await requirePage({ permission: "loyalty.manage", feature: "loyalty" });
  const rewards = await listRewards(ctx);
  const s = ctx.settings;
  return <LoyaltyPage rewards={rewards} currency={ctx.org.currency} settings={{ enabled: s.loyaltyEnabled, earnPointsPer100: s.loyaltyEarnPointsPer100, pointValueMinor: s.loyaltyPointValueMinor }} />;
}
