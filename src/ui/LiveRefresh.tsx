"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "./cn";

/**
 * Subscribes to the branch's event stream (SSE) and refreshes server data when
 * something changes. Falls back to polling if the stream can't connect.
 */
export function LiveRefresh({ branchId, topics, indicator = true, fallbackSeconds = 10 }: { branchId: string; topics: string[]; indicator?: boolean; fallbackSeconds?: number }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const last = useRef(0);
  const key = topics.join(",");

  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    const refresh = () => {
      const now = Date.now();
      if (now - last.current > 700) { last.current = now; router.refresh(); }
    };
    const startPolling = () => { if (!poll) poll = setInterval(refresh, fallbackSeconds * 1000); };
    try {
      es = new EventSource(`/api/events?branch=${encodeURIComponent(branchId)}&topics=${encodeURIComponent(key)}`);
      es.onopen = () => { setLive(true); if (poll) { clearInterval(poll); poll = null; } };
      es.onmessage = refresh;
      es.onerror = () => { setLive(false); startPolling(); };
    } catch { startPolling(); }
    return () => { es?.close(); if (poll) clearInterval(poll); };
  }, [branchId, key, router, fallbackSeconds]);

  if (!indicator) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={live ? "Live updates connected" : "Reconnecting…"}>
      <span className={cn("size-2 rounded-full", live ? "bg-success" : "animate-pulse-soft bg-warning")} />
      {live ? "Live" : "Reconnecting"}
    </span>
  );
}
