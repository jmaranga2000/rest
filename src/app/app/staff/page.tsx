import { headers } from "next/headers";
import { requirePage } from "@/platform/http/request";
import { listRoles, listStaff, listBranches } from "@/modules/admin/service";
import { StaffPage } from "@/modules/admin/views/AdminPages";
export const metadata = { title: "Staff" };
export default async function Page() {
  const ctx = await requirePage({ permission: "staff.manage" });
  const [staff, roles, branches, h] = await Promise.all([listStaff(ctx), listRoles(ctx), listBranches(ctx), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  return <StaffPage staff={staff} meId={ctx.userId} origin={origin} roles={roles.filter((r) => r.key !== "owner" || ctx.roleKey === "owner").map((r) => ({ id: r.id, name: r.name }))} branches={branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }))} />;
}
