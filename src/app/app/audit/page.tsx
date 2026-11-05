import { requirePage } from "@/platform/http/request";
import { listAudit } from "@/modules/admin/service";
import { AuditPage } from "@/modules/admin/views/AdminPages";
export const metadata = { title: "Audit log" };
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requirePage({ permission: "audit.view", feature: "audit_log" });
  const { q } = await searchParams;
  return <AuditPage rows={await listAudit(ctx, { q, limit: 200 })} timezone={ctx.activeBranch?.timezone || ctx.org.timezone} />;
}
