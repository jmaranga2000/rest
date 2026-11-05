import { requirePage } from "@/platform/http/request";
import { activeBranchOrThrow } from "@/platform/rbac/guard";
import { currentShift, getShift, listShifts } from "@/modules/orders/service";
import { ShiftsPage } from "@/modules/orders/views/ShiftsPage";

export const metadata = { title: "Cash shifts" };
export default async function Page() {
  const ctx = await requirePage({ permission: "shifts.manage" });
  const branch = activeBranchOrThrow(ctx);
  const [open, shifts] = await Promise.all([currentShift(ctx, branch.id), listShifts(ctx, { branchId: branch.id })]);
  const mine = open ? await getShift(ctx, open.id) : null;
  return <ShiftsPage shifts={shifts} mine={mine} branchId={branch.id} currency={ctx.org.currency} timezone={branch.timezone || ctx.org.timezone} showAll={ctx.permissions.has("shifts.view_all")} />;
}
