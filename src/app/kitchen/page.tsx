import { requirePage } from "@/platform/http/request";
import { activeBranchOrThrow } from "@/platform/rbac/guard";
import { getKitchenBoard } from "@/modules/orders/service";
import { KitchenBoard } from "@/modules/orders/views/KitchenBoard";

export const metadata = { title: "Kitchen" };

export default async function Page({ searchParams }: { searchParams: Promise<{ station?: string }> }) {
  const ctx = await requirePage({ permission: "kitchen.view", feature: "kitchen" }, "/kitchen");
  const branch = activeBranchOrThrow(ctx);
  const { station } = await searchParams;
  const [tickets, stations] = await Promise.all([
    getKitchenBoard(ctx, branch.id, station || null),
    ctx.db.col<{ id: string; name: string; sortOrder: number }>("stations").find({ orgId: ctx.org.id, isActive: true }, { sort: { sortOrder: 1, name: 1 } }).then((rows) => rows.map((r) => ({ id: r.id, name: r.name }))),
  ]);
  return <KitchenBoard branchId={branch.id} branchName={branch.name} tickets={tickets} stations={stations} station={station ?? null} lateMinutes={ctx.settings.kitchenLateMinutes} canOperate={ctx.permissions.has("kitchen.operate")} serverNow={new Date().toISOString()} />;
}
