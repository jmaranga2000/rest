import type { Ctx } from "../auth/context";
import { newId } from "../ids";

export interface AuditInput {
  action: string;               // "menu.product.created"
  entityType?: string;
  entityId?: string;
  summary: string;              // human sentence: "Price of Chicken Burger changed 800 → 850"
  branchId?: string | null;
  data?: Record<string, unknown>;
}

/** Append-only. Written inside the caller's transaction so audit and change commit together. */
export async function audit(ctx: Pick<Ctx, "db" | "org" | "userId" | "userName" | "ip">, e: AuditInput): Promise<void> {
  await ctx.db.col("auditLogs").insert({
    id: newId("audit"), orgId: ctx.org.id, branchId: e.branchId ?? null,
    actorId: ctx.userId, actorName: ctx.userName,
    action: e.action, entityType: e.entityType ?? null, entityId: e.entityId ?? null,
    summary: e.summary, data: e.data ?? null, ip: ctx.ip,
    createdAt: new Date().toISOString(),
  });
}
