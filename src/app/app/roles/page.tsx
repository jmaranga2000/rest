import { requirePage } from "@/platform/http/request";
import { listRoles } from "@/modules/admin/service";
import { RolesPage } from "@/modules/admin/views/AdminPages";
export const metadata = { title: "Roles" };
export default async function Page() { const ctx = await requirePage({ permission: "roles.manage" }); return <RolesPage roles={await listRoles(ctx)} />; }
