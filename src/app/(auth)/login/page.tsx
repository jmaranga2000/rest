import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx } from "@/platform/http/request";
import { homeForRole } from "@/modules/identity/auth.service";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const ctx = await getCtx();
  if (ctx) redirect(homeForRole(ctx.roleKey));
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-8 mt-1.5 text-sm text-muted">Sign in to your restaurant workspace.</p>
      <LoginForm next={next} />
      <p className="mt-8 text-center text-sm text-muted">New here? <Link className="font-medium text-primary hover:underline" href="/register">Start a free 14-day trial</Link></p>
    </>
  );
}
