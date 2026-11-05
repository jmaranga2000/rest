import { Badge } from "@/ui/Badge";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { Alert } from "@/ui/misc";
import type { PlatformPaystackInfo } from "../service";
import { CopyRow } from "./CopyRow";

/** Operator console: the platform's own Paystack account (subscriptions). Keys live in .env; the two URLs go in the Paystack dashboard. */
export function PlatformPaystackCard({ info }: { info: PlatformPaystackInfo }) {
  return (
    <Card className="mb-6"><CardHeader title="Paystack · subscription payments" description="Your platform's own Paystack account. Restaurants pay their plan here."
      actions={<Badge tone={info.configured ? "success" : "warning"}>{info.configured ? `Keys loaded · ${info.mode}` : "Keys missing"}</Badge>} />
      <CardBody className="space-y-4">
        {!info.configured ? <Alert tone="warning" title="Subscription payments are off">Set <code>PAYSTACK_SECRET_KEY</code> and <code>PAYSTACK_PUBLIC_KEY</code> in the server environment (.env), then restart.</Alert> : null}
        <div className="space-y-3 rounded-lg bg-surface-2 p-4 text-sm">
          <p className="font-medium">In your Paystack dashboard → Settings → API Keys &amp; Webhooks, set:</p>
          <CopyRow label="Callback URL" value={info.callbackUrl} hint="Where customers land after paying. Used for subscriptions and for every restaurant's customer payments." />
          <CopyRow label="Webhook URL" value={info.webhookUrl} hint="Paystack calls this when a payment succeeds, so plans activate even if the owner closes the page." />
        </div>
      </CardBody></Card>);
}
