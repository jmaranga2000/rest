import { requirePage } from "@/platform/http/request";
import { getQrBoard } from "@/modules/guest/qr-board";
import { QrPage } from "@/modules/guest/views/QrPage";

export const metadata = { title: "QR codes · Menu" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requirePage({ anyPermission: ["menu.view", "menu.manage"] });
  const board = await getQrBoard(ctx, ctx.activeBranch?.id ?? "");
  const items = await ctx.db.col("products").count({ orgId: ctx.org.id, isActive: true });
  return <QrPage board={board} orgName={ctx.org.name} logoUrl={ctx.org.logoUrl} counts={{ items }} can={{ manage: ctx.permissions.has("menu.manage"), settings: ctx.permissions.has("settings.manage") }} />;
}
