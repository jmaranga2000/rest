import { webhookResponse } from "@/modules/payments/webhook-route";
export const dynamic = "force-dynamic";
/** Platform webhook (subscriptions). Set `{APP_URL}/api/webhooks/paystack` in the platform's Paystack dashboard. */
export const POST = (req: Request) => webhookResponse(req, null);
