import { requirePage } from "@/platform/http/request";
import { SettingsPage } from "@/modules/admin/views/SettingsPage";
import { getGatewayStatus } from "@/modules/payments/service";
export const metadata = { title: "Settings" };
export default async function Page() {
  const ctx = await requirePage({ permission: "settings.manage" });
  return <SettingsPage org={{ name: ctx.org.name, currency: ctx.org.currency, timezone: ctx.org.timezone }} settings={ctx.settings} gateway={await getGatewayStatus(ctx)} />;
}
