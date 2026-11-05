import { getCtx } from "@/platform/http/request";
import { getDb } from "@/platform/db";
import type { Permission } from "@/platform/rbac/permissions";
import { latestEventId, readEventsAfter, type Topic } from "@/platform/events/outbox";

export const dynamic = "force-dynamic";

const TOPIC_PERMISSION: Record<Topic, Permission[]> = {
  kitchen: ["kitchen.view", "orders.view", "orders.create"], orders: ["orders.view", "orders.create"], inventory: ["inventory.view"], display: ["orders.view"],
};

/** Short polling endpoint for branch outbox events; avoids long-lived serverless requests. */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const branchId = url.searchParams.get("branch") ?? "";
  if (!ctx.branches.some((b) => b.id === branchId)) return new Response("Forbidden", { status: 403 });
  const topics = (url.searchParams.get("topics") ?? "kitchen").split(",").filter((t): t is Topic => t in TOPIC_PERMISSION && TOPIC_PERMISSION[t as Topic].some((p) => ctx.permissions.has(p)));
  if (!topics.length) return new Response("Forbidden", { status: 403 });

  const db = await getDb();
  const afterParam = url.searchParams.get("after");
  if (afterParam !== null && (!/^\d+$/.test(afterParam) || !Number.isSafeInteger(Number(afterParam)))) {
    return Response.json({ error: "Invalid event cursor." }, { status: 400 });
  }
  const after = afterParam === null ? await latestEventId(db, ctx.org.id, branchId) : Number(afterParam);
  const events = afterParam === null ? [] : await readEventsAfter(db, ctx.org.id, branchId, after, topics);
  const cursor = events.at(-1)?.id ?? after;
  return Response.json({ events, cursor }, { headers: { "Cache-Control": "no-store" } });
}
