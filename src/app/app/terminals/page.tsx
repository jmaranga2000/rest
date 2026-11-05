import { requirePage } from "@/platform/http/request";
import { listBranches, listTerminals } from "@/modules/admin/service";
import { TerminalsPage } from "@/modules/admin/views/AdminPages";
export const metadata = { title: "Devices" };
export default async function Page() {
  const ctx = await requirePage({ permission: "terminals.manage" });
  const [terminals, branches] = await Promise.all([listTerminals(ctx), listBranches(ctx)]);
  return <TerminalsPage terminals={terminals} branches={branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }))} />;
}
