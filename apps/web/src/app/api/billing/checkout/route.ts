import { requireAuthenticatedUser } from "@/server/auth/authorization";
import { getOrCreateStripeCustomer } from "@/server/billing/customer";
import { billingError, safeAppOrigin } from "@/server/billing/http";
import { getCheckoutPlan, isPlanCode } from "@/server/billing/plans";
import { getStripeClient } from "@/server/stripe/client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const principal = await requireAuthenticatedUser();
  if (principal instanceof Response) return principal;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return billingError(400, "invalid_json");
  }
  const planCode =
    typeof body === "object" && body !== null && "planCode" in body
      ? (body as { planCode?: unknown }).planCode
      : undefined;
  if (!isPlanCode(planCode)) return billingError(400, "invalid_plan");

  try {
    const plan = await getCheckoutPlan(planCode);
    const customerId = await getOrCreateStripeCustomer(principal.userId);
    const appOrigin = safeAppOrigin(request);
    const metadata = {
      iqstats_user_id: principal.userId,
      iqstats_plan_code: plan.code,
    };
    const session = await getStripeClient().checkout.sessions.create({
      mode: plan.billing_mode === "one_time" ? "payment" : "subscription",
      customer: customerId,
      client_reference_id: principal.userId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      metadata,
      ...(plan.billing_mode === "subscription"
        ? { subscription_data: { metadata } }
        : {}),
      success_url: new URL("/account/billing?checkout=success", appOrigin).toString(),
      cancel_url: new URL("/account/billing?checkout=canceled", appOrigin).toString(),
    });

    if (!session.url || session.livemode) return billingError(503, "checkout_unavailable");
    return Response.json(
      { url: session.url },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return billingError(503, "checkout_unavailable");
  }
}
