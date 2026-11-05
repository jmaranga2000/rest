import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/platform/db";
import { readCookie, TERMINAL_COOKIE } from "@/platform/http/cookies";
import { getTerminalByToken, listPinUsers } from "@/modules/identity/auth.service";
import { PinPad } from "./PinPad";

export const metadata = { title: "Staff sign-in" };
export const dynamic = "force-dynamic";

export default async function PinPage() {
  const token = await readCookie(TERMINAL_COOKIE());
  const db = await getDb();
  const terminal = token ? await getTerminalByToken(db, token) : null;
  if (!terminal) redirect("/pair");
  const staff = await listPinUsers(db, terminal);
  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wider text-subtle">{terminal.orgName} · {terminal.branchName}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Who&apos;s working?</h1>
      <p className="mb-6 mt-1.5 text-sm text-muted">{terminal.name} — pick your name, then enter your PIN.</p>
      <PinPad staff={staff} />
      <p className="mt-8 text-center text-sm text-muted"><Link className="font-medium text-primary hover:underline" href="/login">Sign in with email instead</Link></p>
    </>
  );
}
