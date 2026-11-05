import { webhookResponse } from "@/modules/payments/webhook-route";
export const dynamic = "force-dynamic";
/** Per-restaurant webhook. The super admin gives each restaurant `{APP_URL}/api/webhooks/paystack/{orgId}` for their own Paystack dashboard. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return webhookResponse(req, (await params).orgId);
}
