import { headers } from "next/headers";
import { requirePage } from "@/platform/http/request";
import { listBranches, listSlides } from "@/modules/admin/service";
import { DisplaysPage } from "@/modules/admin/views/DisplaysPage";
export const metadata = { title: "Customer displays" };
export default async function Page() {
  const ctx = await requirePage({ permission: "displays.manage", feature: "displays" });
  const [slides, branches, h] = await Promise.all([listSlides(ctx), listBranches(ctx), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  return <DisplaysPage slides={slides} origin={origin} branches={branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name, displayKey: b.displayKey }))} />;
}
