import { requirePlatformPage } from "@/modules/platform-admin/request";
import { listPlanRequests } from "@/modules/platform-admin/service";
import { PlatformRequests } from "@/modules/platform-admin/views/PlatformViews";
export const metadata = { title: "Plan requests" };
export default async function Page() { const ctx = await requirePlatformPage(); return <PlatformRequests requests={await listPlanRequests(ctx)} />; }
