import type { Db, Doc } from "../db";
import { nextCounter } from "../db";

/**
 * Topics are coarse streams a screen subscribes to. Events are inserted in the
 * SAME transaction as the change that caused them (transactional outbox), so a
 * client can never see an event for a change that rolled back, nor miss one
 * for a change that committed.
 */
export type Topic = "kitchen" | "orders" | "inventory" | "display";

export interface OutboxEvent {
  id: number;
  branchId: string;
  topic: Topic;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function emit(db: Db, e: { orgId: string; branchId: string; topic: Topic; type: string; payload?: Record<string, unknown> }): Promise<void> {
  const seq = await nextCounter(db, "_", null, "events");
  await db.col("events").insert({
    id: `evt_${String(seq).padStart(12, "0")}`, seq, orgId: e.orgId, branchId: e.branchId, topic: e.topic, type: e.type,
    payload: e.payload ?? {}, createdAt: new Date().toISOString(),
  });
}

export async function latestEventId(db: Db, orgId: string, branchId: string): Promise<number> {
  const r = await db.col<Doc & { seq: number }>("events").findOne({ orgId, branchId }, { sort: { seq: -1 } });
  return Number(r?.seq ?? 0);
}

export async function readEventsAfter(db: Db, orgId: string, branchId: string, afterId: number, topics: Topic[], limit = 100): Promise<OutboxEvent[]> {
  const rows = await db.col<Doc & { seq: number; branchId: string; topic: Topic; type: string; payload: Record<string, unknown>; createdAt: string }>("events")
    .find({ orgId, branchId, seq: { $gt: afterId }, topic: { $in: topics } }, { sort: { seq: 1 }, limit });
  return rows.map((r) => ({ id: Number(r.seq), branchId: r.branchId, topic: r.topic, type: r.type, payload: r.payload, createdAt: r.createdAt }));
}

export async function purgeOldEvents(db: Db, olderThanHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
  return db.col("events").delete({ createdAt: { $lt: cutoff } });
}
