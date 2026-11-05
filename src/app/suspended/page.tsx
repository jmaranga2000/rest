import Link from "next/link";
import { LuLock } from "react-icons/lu";
export const metadata = { title: "Workspace suspended" };
export default function Suspended() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger"><LuLock className="size-6" /></div>
        <h1 className="text-2xl font-semibold tracking-tight">This workspace is suspended</h1>
        <p className="mt-2 text-muted">Access has been paused by the platform team, usually because of an unpaid subscription. Your data is safe. Contact support to restore access.</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">Back to sign in</Link>
      </div>
    </main>
  );
}
