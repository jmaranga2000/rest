import type { Ctx } from "@/platform/auth/context";
import type { Doc } from "@/platform/db";
import { requireBranch } from "@/platform/rbac/guard";
import { env } from "@/platform/env";
import { ensureTableTokens } from "./service";

export interface QrTable { id: string; label: string; seats: number; area: string; url: string; token: string; hasOpenOrder: boolean }
export interface QrBoard { branchId: string; branchName: string; tables: QrTable[]; settings: { qrOrderingEnabled: boolean; qrAutoSend: boolean } }

export const tableUrl = (token: string): string => `${env().APP_URL.replace(/\/$/, "")}/o/${token}`;

/** Every active table of the branch with its scan URL (tokens are created on first view for tables that predate QR ordering). */
export async function getQrBoard(ctx: Ctx, branchId: string): Promise<QrBoard> {
  const branch = requireBranch(ctx, branchId);
  await ensureTableTokens(ctx.db, ctx.org.id, branchId);
  const [tables, areas, open] = await Promise.all([
    ctx.db.col<Doc & { label: string; seats: number; areaId: string | null; qrToken: string; sortOrder: number }>("diningTables").find({ orgId: ctx.org.id, branchId, isActive: true }),
    ctx.db.col<Doc & { name: string; sortOrder: number }>("floorAreas").find({ orgId: ctx.org.id, branchId }),
    ctx.db.col<Doc & { tableId: string }>("orders").find({ orgId: ctx.org.id, branchId, status: "open", tableId: { $type: "string" } }),
  ]);
  const areaName = new Map(areas.map((a) => [a.id, a]));
  const busy = new Set(open.map((o) => o.tableId));
  const rows = tables.filter((t) => t.qrToken).map((t) => ({ t, a: t.areaId ? areaName.get(t.areaId) : undefined }))
    .sort((x, y) => Number(x.a?.sortOrder ?? 999) - Number(y.a?.sortOrder ?? 999) || Number(x.t.sortOrder) - Number(y.t.sortOrder) || x.t.label.localeCompare(y.t.label, undefined, { numeric: true }));
  const s = await ctx.db.col<Doc & { qrOrderingEnabled?: boolean; qrAutoSend?: boolean }>("orgSettings").findOne({ id: ctx.org.id });
  return {
    branchId, branchName: branch.name,
    tables: rows.map(({ t, a }) => ({ id: t.id, label: t.label, seats: Number(t.seats), area: a?.name ?? "No area", url: tableUrl(t.qrToken), token: t.qrToken, hasOpenOrder: busy.has(t.id) })),
    settings: { qrOrderingEnabled: s?.qrOrderingEnabled ?? true, qrAutoSend: s?.qrAutoSend ?? true },
  };
}
