import { notFound } from "next/navigation";
import { requirePlatformPage } from "@/modules/platform-admin/request";
import { getOrgDetail } from "@/modules/platform-admin/service";
import { NotFoundError } from "@/platform/errors";
import { listPlans } from "@/modules/billing/plans.repo";
import { getGatewayView } from "@/modules/payments/service";
import { PlatformOrgDetail } from "@/modules/platform-admin/views/PlatformViews";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
  const data = await getOrgDetail(ctx, id).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  return <PlatformOrgDetail data={data} plans={(await listPlans(ctx.db)).filter((p) => p.isActive).map((p) => ({ code: p.code, name: p.name }))} gateway={await getGatewayView(ctx.db, id)} />;
}
