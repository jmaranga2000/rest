import { LuCreditCard } from "react-icons/lu";
import { Badge } from "@/ui/Badge";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import type { GatewayStatus } from "../service";

/** Owner-facing, read-only. Paystack keys are set up by the platform team, never entered here. */
export function PaystackStatus({ gateway }: { gateway: GatewayStatus }) {
  return (
    <Card><CardHeader title="Online payments · Paystack" actions={<Badge tone={gateway.enabled ? "success" : "neutral"}>{gateway.enabled ? "On" : "Not set up"}</Badge>} />
      <CardBody className="flex items-start gap-3 text-sm">
        <LuCreditCard className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
        {gateway.enabled
          ? <p>Customers can pay by card, M-Pesa or bank through Paystack. Cashiers will see <strong>Paystack</strong> as a payment method at the till, and orders close automatically once the payment is confirmed. You can hide it from the till in <em>Payment methods</em> below.</p>
          : <p className="text-muted">Paystack isn&apos;t connected for your business. To accept card and mobile-money payments online, contact support and we&apos;ll connect your Paystack account for you.</p>}
      </CardBody></Card>);
}
