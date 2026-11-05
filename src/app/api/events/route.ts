import { getCtx } from "@/platform/http/request";
import { getDb } from "@/platform/db";
import type { Permission } from "@/platform/rbac/permissions";
import { latestEventId, readEventsAfter, type Topic } from "@/platform/events/outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TOPIC_PERMISSION: Record<Topic, Permission[]> = {
  kitchen: ["kitchen.view", "orders.view", "orders.create"], orders: ["orders.view", "orders.create"], inventory: ["inventory.view"], display: ["orders.view"],
};

/** Server-Sent Events: streams outbox rows for one branch. Clients reconnect automatically with Last-Event-ID. */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const branchId = url.searchParams.get("branch") ?? "";
  if (!ctx.branches.some((b) => b.id === branchId)) return new Response("Forbidden", { status: 403 });
  const topics = (url.searchParams.get("topics") ?? "kitchen").split(",").filter((t): t is Topic => t in TOPIC_PERMISSION && TOPIC_PERMISSION[t as Topic].some((p) => ctx.permissions.has(p)));
  if (!topics.length) return new Response("Forbidden", { status: 403 });

  const db = await getDb();
  let last = Number(req.headers.get("last-event-id")) || (await latestEventId(db, ctx.org.id, branchId));
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let beat = 0;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode("retry: 3000\n\n"));
      const tick = async () => {
        try {
          const events = await readEventsAfter(db, ctx.org.id, branchId, last, topics);
          for (const e of events) { last = e.id; controller.enqueue(enc.encode(`id: ${e.id}\ndata: ${JSON.stringify({ topic: e.topic, type: e.type, ...e.payload })}\n\n`)); }
          if (!events.length && ++beat % 15 === 0) controller.enqueue(enc.encode(": keep-alive\n\n"));
        } catch { /* transient DB error: next tick retries */ }
      };
      timer = setInterval(tick, 1000);
      req.signal.addEventListener("abort", () => { clearInterval(timer); try { controller.close(); } catch { /* already closed */ } });
    },
    cancel() { clearInterval(timer); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
