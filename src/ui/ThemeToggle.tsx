"use client";
import { useEffect, useState } from "react";
import { LuMonitor, LuMoon, LuSun } from "react-icons/lu";
import { cn } from "./cn";

type Mode = "system" | "light" | "dark";
export const THEME_KEY = "ros-theme";

export function applyTheme(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/** Runs before first paint (inlined in <head>) so there is no light→dark flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem("${THEME_KEY}")||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;

export function ThemeToggle({ compact, compactOnMobile }: { compact?: boolean; compactOnMobile?: boolean }) {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => { try { setMode((localStorage.getItem(THEME_KEY) as Mode) || "system"); } catch { /* storage blocked */ } }, []);
  function choose(m: Mode) {
    setMode(m);
    try { localStorage.setItem(THEME_KEY, m); } catch { /* storage blocked */ }
    applyTheme(m);
  }
  const opts: { m: Mode; icon: React.ReactNode; label: string }[] = [
    { m: "light", icon: <LuSun />, label: "Light" }, { m: "system", icon: <LuMonitor />, label: "System" }, { m: "dark", icon: <LuMoon />, label: "Dark" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {opts.map((o) => (
        <button key={o.m} type="button" role="radio" aria-checked={mode === o.m} title={o.label} onClick={() => choose(o.m)}
          className={cn("flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors", mode === o.m ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}>
          {o.icon}{compact ? null : <span className={compactOnMobile ? "hidden sm:inline" : undefined}>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}
