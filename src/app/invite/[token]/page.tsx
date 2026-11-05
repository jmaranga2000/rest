import Link from "next/link";
import { getDb } from "@/platform/db";
import { previewInvitation } from "@/modules/admin/service";
import { AcceptInviteForm } from "./AcceptInviteForm";
export const metadata = { title: "Join your team" };
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await previewInvitation(await getDb(), token);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      {inv ? (<><h1 className="text-2xl font-semibold tracking-tight">Join {inv.orgName}</h1><p className="mb-8 mt-1.5 text-sm text-muted">You've been invited as <strong>{inv.roleName}</strong> ({inv.email}). Choose a password to finish.</p><AcceptInviteForm token={token} defaultName={inv.name ?? ""} /></>)
        : (<><h1 className="text-2xl font-semibold">Invitation not valid</h1><p className="mt-2 text-sm text-muted">This link has expired or was already used. Ask your manager for a new one.</p><Link href="/login" className="mt-6 text-sm font-medium text-primary hover:underline">Go to sign in</Link></>)}
    </main>);
}
