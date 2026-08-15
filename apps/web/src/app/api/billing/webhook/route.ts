import type Stripe from "stripe";

import { applyBillingState } from "@/server/billing/apply-state";
import { billingError } from "@/server/billing/http";
import { getCheckoutPlan, isPlanCode } from "@/server/billing/plans";
import {
  normalizeOneTimeCheckout,
  normalizeSubscriptionEvent,
} from "@/server/billing/state";
import { serverEnv } from "@/server/config/env";
import { getStripeClient } from "@/server/stripe/client";

export const dynamic = "force-dynamic";

const subscriptionEvents = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return billingError(400, "missing_signature");

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(
      payload,
      signature,
      serverEnv.stripeWebhookSecret(),
    );
  } catch {
    return billingError(400, "invalid_signature");
  }

  if (event.livemode) return billingError(403, "live_mode_disabled");

  try {
    if (subscriptionEvents.has(event.type)) {
      await applyBillingState(
        normalizeSubscriptionEvent(event, event.data.object as Stripe.Subscription),
      );
    } else if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!subscriptionId) throw new Error("Checkout Session has no subscription");
        const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
        await applyBillingState(normalizeSubscriptionEvent(event, subscription));
      } else if (session.mode === "payment" && session.payment_status === "paid") {
        const planCode = session.metadata?.iqstats_plan_code;
        if (!isPlanCode(planCode)) throw new Error("Checkout Session has no valid plan");
        const [plan, lineItems] = await Promise.all([
          getCheckoutPlan(planCode),
          getStripeClient().checkout.sessions.listLineItems(session.id, { limit: 1 }),
        ]);
        const priceId = lineItems.data[0]?.price?.id;
        if (
          plan.billing_mode !== "one_time" ||
          !plan.access_duration_days ||
          !priceId ||
          priceId !== plan.stripe_price_id
        ) {
          throw new Error("Checkout price does not match the IQstatS plan");
        }
        await applyBillingState(
          normalizeOneTimeCheckout(event, session, priceId, plan.access_duration_days),
        );
      }
    }
  } catch {
    return billingError(503, "webhook_processing_failed");
  }

  return Response.json(
    { received: true },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
