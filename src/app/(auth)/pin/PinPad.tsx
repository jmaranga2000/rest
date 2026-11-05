"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LuDelete } from "react-icons/lu";
import { Avatar, Alert } from "@/ui/misc";
import { cn } from "@/ui/cn";
import { pinLoginAction } from "@/modules/identity/actions";

interface Staff { id: string; name: string; color: string; roleName: string }

export function PinPad({ staff }: { staff: Staff[] }) {
  const router = useRouter();
  const [who, setWho] = useState<Staff | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(value: string) {
    if (!who) return;
    start(async () => {
      const res = await pinLoginAction({ userId: who.id, pin: value });
      if (res.ok) { router.push((res.data as { redirectTo: string }).redirectTo); router.refresh(); }
      else { setError(res.error.message); setPin(""); }
    });
  }
  function press(d: string) {
    if (pending) return;
    setError(null);
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (next.length === 6) submit(next);
  }

  if (!who) {
    if (!staff.length) return <Alert tone="warning" title="No staff with PINs">Ask a manager to set a PIN for you in Staff.</Alert>;
    return (
      <ul className="grid grid-cols-2 gap-3">
        {staff.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setWho(s)} className="flex w-full flex-col items-center gap-2 rounded-xl border border-line bg-surface p-4 text-center transition hover:border-primary hover:shadow-pop">
              <Avatar name={s.name} color={s.color} size={44} />
              <span className="text-sm font-semibold">{s.name}</span><span className="text-xs text-muted">{s.roleName}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div>
      <button type="button" className="mb-4 flex items-center gap-3 text-left" onClick={() => { setWho(null); setPin(""); setError(null); }}>
        <Avatar name={who.name} color={who.color} /><span><span className="block text-sm font-semibold">{who.name}</span><span className="text-xs text-primary">Not you?</span></span>
      </button>
      <div className="mb-4 flex justify-center gap-3" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: 6 }, (_, i) => <span key={i} className={cn("size-3.5 rounded-full border border-line-strong", i < pin.length && "border-primary bg-primary")} />)}
      </div>
      {error ? <div className="mb-3"><Alert tone="danger">{error}</Alert></div> : null}
      <div className="grid grid-cols-3 gap-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" onClick={() => press(d)} className="num h-16 rounded-xl bg-surface text-2xl font-medium shadow-sm ring-1 ring-line transition active:scale-95 hover:bg-surface-2">{d}</button>)}
        <button type="button" aria-label="Delete" onClick={() => setPin((p) => p.slice(0, -1))} className="flex h-16 items-center justify-center rounded-xl text-muted hover:bg-surface-2"><LuDelete className="size-6" /></button>
        <button type="button" onClick={() => press("0")} className="num h-16 rounded-xl bg-surface text-2xl font-medium shadow-sm ring-1 ring-line transition active:scale-95 hover:bg-surface-2">0</button>
        <button type="button" disabled={pin.length < 4 || pending} onClick={() => submit(pin)} className="h-16 rounded-xl bg-primary text-sm font-semibold text-primary-fg disabled:opacity-40">{pending ? "…" : "Enter"}</button>
      </div>
    </div>
  );
}
