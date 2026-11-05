"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "./cn";

/**
 * Polls the branch outbox for changes and refreshes server data when needed.
 * Short requests work reliably on serverless hosts with execution time limits.
 */
export function LiveRefresh({ branchId, topics, indicator = true, fallbackSeconds = 10 }: { branchId: string; topics: string[]; indicator?: boolean; fallbackSeconds?: number }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const last = useRef(0);
  const key = topics.join(",");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor = 0;
    let initialized = false;
    const refresh = () => {
      const now = Date.now();
      if (now - last.current > 700) { last.current = now; router.refresh(); }
    };

    const poll = async () => {
      try {
        const query = new URLSearchParams({ branch: branchId, topics: key });
        if (initialized) query.set("after", String(cursor));
        const response = await fetch(`/api/events?${query}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Event poll failed with status ${response.status}`);
        const result = await response.json() as { events: unknown[]; cursor: number };
        if (stopped) return;
        if (!Array.isArray(result.events) || !Number.isSafeInteger(result.cursor) || result.cursor < 0) {
          throw new Error("Event poll returned an invalid response.");
        }
        cursor = result.cursor;
        initialized = true;
        setLive(true);
        if (result.events.length) refresh();
      } catch {
        if (!stopped) setLive(false);
      }
      if (!stopped) timer = setTimeout(poll, fallbackSeconds * 1000);
    };

    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [branchId, key, router, fallbackSeconds]);

  if (!indicator) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={live ? "Live updates connected" : "Reconnecting…"}>
      <span className={cn("size-2 rounded-full", live ? "bg-success" : "animate-pulse-soft bg-warning")} />
      {live ? "Live" : "Reconnecting"}
    </span>
  );
}
