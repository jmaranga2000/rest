import { redirect } from "next/navigation";
import { getPlatformCtx } from "@/modules/platform-admin/request";
import { PlatformLoginForm } from "./PlatformLoginForm";
export const metadata = { title: "Operator sign in" };
export const dynamic = "force-dynamic";
export default async function Page() {
  if (await getPlatformCtx()) redirect("/platform");
  return <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4"><h1 className="text-2xl font-semibold tracking-tight">Operator console</h1><p className="mb-8 mt-1.5 text-sm text-muted">Restricted to platform staff.</p><PlatformLoginForm /></main>;
}
