import { redirect } from "next/navigation";
import { LuCircleCheck, LuTriangleAlert, LuClock } from "react-icons/lu";
import { getDb } from "@/platform/db";
import { settleByReference } from "@/modules/payments/service";
export const dynamic = "force-dynamic";
export const metadata = { title: "Payment", robots: { index: false } };

/** Where Paystack sends the customer afterwards. Verifies with Paystack (idempotent), then shows a plain result. Public: shows status only. */
export default async function Page({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const sp = await searchParams;
  const reference = sp.reference ?? sp.trxref ?? "";
  let result = null as Awaited<ReturnType<typeof settleByReference>>;
  try { if (reference) result = await settleByReference(await getDb(), reference); } catch { result = null; }
  if (result?.scope === "subscription") redirect(`/app/billing?paystack=${result.status}`);
  const state = result?.status === "success" ? "ok" : result && (result.status === "failed") ? "failed" : result?.status === "review" ? "review" : "wait";
  const Icon = state === "ok" ? LuCircleCheck : state === "wait" ? LuClock : LuTriangleAlert;
  const text = { ok: ["Payment received", "Thank you! You can close this page."], failed: ["Payment did not go through", result?.message ?? "Please try again or ask the cashier for help."], review: ["We received your payment", "The cashier will confirm it shortly."], wait: ["Waiting for confirmation", "If you have paid, this will update in a moment. You can close this page."] }[state];
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6 text-fg"><div className="max-w-sm text-center">
      <Icon className={`mx-auto size-14 ${state === "ok" ? "text-success" : state === "failed" ? "text-danger" : "text-muted"}`} aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">{text[0]}</h1><p className="mt-2 text-muted">{text[1]}</p>
    </div></main>);
}
