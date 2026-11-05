import { LuSparkles } from "react-icons/lu";
import { EmptyState } from "@/ui/misc";
import { Button } from "@/ui/Button";
import { requirePage } from "@/platform/http/request";
import { FEATURES, type Feature } from "@/platform/tenancy/plans";
export const metadata = { title: "Upgrade" };
export default async function Upgrade({ searchParams }: { searchParams: Promise<{ feature?: string }> }) {
  const ctx = await requirePage();
  const { feature } = await searchParams;
  const label = feature && feature in FEATURES ? FEATURES[feature as Feature] : "This feature";
  return <EmptyState icon={<LuSparkles />} title={`${label} isn't in the ${ctx.plan.name} plan`}
    description="Upgrade your plan to unlock it. Your existing data and settings stay exactly as they are."
    action={ctx.permissions.has("billing.manage") ? <Button href="/app/billing">See plans</Button> : <p className="text-sm text-muted">Ask your account owner to upgrade.</p>} />;
}
