"use client";
import { useEffect, useState } from "react";
import { HONEYPOT_FIELD, TIME_FIELD } from "@/platform/security/honeypot";

/** Invisible anti-bot fields. Drop inside any public form whose action is `definePublicAction({ honeypot: true })`. */
export function Honeypot() {
  const [t, setT] = useState("");
  useEffect(() => { setT(String(Date.now())); }, []);
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
      <label>Leave this field empty<input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      <input type="hidden" name={TIME_FIELD} value={t} readOnly />
    </div>
  );
}
