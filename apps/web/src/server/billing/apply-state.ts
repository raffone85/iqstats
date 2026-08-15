import "server-only";

import { getSupabaseAdminClient } from "@/server/supabase/admin";
import type { BillingState } from "@/server/billing/state";

export async function applyBillingState(state: BillingState) {
  if (state.livemode) throw new Error("Stripe live mode is not enabled for IQstatS");

  const { data, error } = await getSupabaseAdminClient().rpc(
    "apply_stripe_billing_state",
    {
      p_event_id: state.eventId,
      p_event_type: state.eventType,
      p_event_created_at: state.eventCreatedAt,
      p_livemode: state.livemode,
      p_user_id: state.userId,
      p_external_key: state.externalKey,
      p_stripe_customer_id: state.stripeCustomerId,
      p_stripe_subscription_id: state.stripeSubscriptionId,
      p_stripe_checkout_session_id: state.stripeCheckoutSessionId,
      p_stripe_price_id: state.stripePriceId,
      p_status: state.status,
      p_current_period_start: state.currentPeriodStart,
      p_current_period_end: state.currentPeriodEnd,
      p_cancel_at_period_end: state.cancelAtPeriodEnd,
      p_canceled_at: state.canceledAt,
      p_ended_at: state.endedAt,
    },
  );
  if (error) throw error;
  return data;
}
