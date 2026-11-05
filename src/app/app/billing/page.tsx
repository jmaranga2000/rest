import { requirePage } from "@/platform/http/request";
import { listPlans } from "@/modules/billing/plans.repo";
import { subscriptionPaymentsEnabled } from "@/modules/payments/service";
import { BillingPage } from "@/modules/admin/views/BillingPage";
export const metadata = { title: "Billing" };
export default async function Page({ searchParams }: { searchParams: Promise<{ paystack?: string }> }) {
  const { paystack } = await searchParams;
  const ctx = await requirePage({ permission: "billing.manage" });
  const [plans, users, branches, terminals, pending] = await Promise.all([
    listPlans(ctx.db, { publicOnly: true }),
    ctx.db.col("users").count({ orgId: ctx.org.id, status: "active" }), ctx.db.col("branches").count({ orgId: ctx.org.id, isActive: true }),
    ctx.db.col("terminals").count({ orgId: ctx.org.id, isActive: true }),
    ctx.db.col<{ id: string; toPlan: string }>("planChangeRequests").findOne({ orgId: ctx.org.id, status: "pending" }),
  ]);
  return <BillingPage plans={plans} current={ctx.plan.code} status={ctx.subscription.status} trialEndsAt={ctx.subscription.trialEndsAt} periodEnd={ctx.subscription.currentPeriodEnd} pendingTo={pending?.toPlan ?? null} usage={{ users, branches, terminals }} timezone={ctx.org.timezone} paystack={subscriptionPaymentsEnabled()} paystackResult={paystack ?? null} />;
}
