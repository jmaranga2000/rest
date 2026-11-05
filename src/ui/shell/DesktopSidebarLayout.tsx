"use client";

import { useState, type ReactNode } from "react";
import { LuMenu } from "react-icons/lu";

export function DesktopSidebarLayout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`min-h-dvh bg-bg lg:grid ${collapsed ? "lg:grid-cols-1" : "lg:grid-cols-[256px_minmax(0,1fr)]"}`}>
      {!collapsed ? <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">{sidebar}</aside> : null}
      <div className="min-w-0">
        <div className="sticky top-0 z-20 hidden h-12 items-center border-b border-line bg-surface/95 px-4 backdrop-blur lg:flex">
          <button type="button" aria-label={collapsed ? "Show sidebar" : "Hide sidebar"} aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg">
            <LuMenu className="size-4" aria-hidden />
            <span>{collapsed ? "Show menu" : "Hide menu"}</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
