import { LuShieldAlert } from "react-icons/lu";
import { EmptyState } from "@/ui/misc";
import { Button } from "@/ui/Button";
export const metadata = { title: "No access" };
export default function Forbidden() {
  return <EmptyState icon={<LuShieldAlert />} title="You don't have access to this page" description="Ask the business owner to give your role the permission it needs." action={<Button href="/app" variant="outline">Back to dashboard</Button>} />;
}
