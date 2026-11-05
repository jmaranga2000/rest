import { requirePage } from "@/platform/http/request";
import { activeBranchOrThrow } from "@/platform/rbac/guard";
import { getFloor } from "@/modules/admin/service";
import { FloorPage } from "@/modules/admin/views/AdminPages";
export const metadata = { title: "Tables & floor" };
export default async function Page() {
  const ctx = await requirePage({ anyPermission: ["floor.manage", "orders.view"] });
  const b = activeBranchOrThrow(ctx);
  return <FloorPage branchId={b.id} branchName={b.name} floor={await getFloor(ctx, b.id)} />;
}
