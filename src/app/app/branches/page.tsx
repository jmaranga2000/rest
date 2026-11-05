import { requirePage } from "@/platform/http/request";
import { listBranches } from "@/modules/admin/service";
import { BranchesPage } from "@/modules/admin/views/AdminPages";
export const metadata = { title: "Branches" };
export default async function Page() { const ctx = await requirePage({ permission: "branches.manage" }); return <BranchesPage branches={await listBranches(ctx)} />; }
