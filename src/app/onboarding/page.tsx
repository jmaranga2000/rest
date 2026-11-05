import { redirect } from "next/navigation";
import { getCtx } from "@/platform/http/request";
import { OnboardingForm } from "./OnboardingForm";
export const metadata = { title: "Set up your restaurant" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (ctx.org.onboardingComplete) redirect("/app");
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <p className="text-sm font-medium text-primary">Welcome, {ctx.userName.split(" ")[0]}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Let's set up {ctx.org.name}</h1>
      <p className="mb-8 mt-1.5 text-sm text-muted">Three quick choices. You can change all of this later in Settings.</p>
      <OnboardingForm currency={ctx.org.currency} timezone={ctx.org.timezone} />
    </main>);
}
