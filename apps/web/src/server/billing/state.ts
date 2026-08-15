import type Stripe from "stripe";

export interface BillingState {
  eventId: string;
  eventType: string;
  eventCreatedAt: string;
  livemode: boolean;
  userId: string;
  externalKey: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  stripePriceId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const stripeId = (value: string | { id: string } | null): string | null =>
  typeof value === "string" ? value : (value?.id ?? null);

export function normalizeSubscriptionEvent(
  event: Stripe.Event,
  subscription: Stripe.Subscription,
): BillingState {
  const userId = subscription.metadata.iqstats_user_id;
  const customerId = stripeId(subscription.customer);
  const item = subscription.items.data[0];
  const priceId = item?.price.id;
  if (!userId || !customerId || !item || !priceId) {
    throw new Error("Stripe subscription is missing IQstatS ownership metadata");
  }

  return {
    eventId: event.id,
    eventType: event.type,
    eventCreatedAt: iso(event.created),
    livemode: event.livemode,
    userId,
    externalKey: `subscription:${subscription.id}`,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripeCheckoutSessionId: null,
    stripePriceId: priceId,
    status: subscription.status,
    currentPeriodStart: iso(item.current_period_start),
    currentPeriodEnd: iso(item.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ? iso(subscription.canceled_at) : null,
    endedAt: subscription.ended_at ? iso(subscription.ended_at) : null,
  };
}

export function normalizeOneTimeCheckout(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  priceId: string,
  durationDays: number,
): BillingState {
  const userId = session.metadata?.iqstats_user_id;
  const customerId = stripeId(session.customer);
  if (
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    !userId ||
    !customerId ||
    !priceId ||
    durationDays <= 0
  ) {
    throw new Error("Stripe Checkout Session is not a paid IQstatS one-time purchase");
  }

  const periodEnd = event.created + durationDays * 24 * 60 * 60;
  return {
    eventId: event.id,
    eventType: event.type,
    eventCreatedAt: iso(event.created),
    livemode: event.livemode,
    userId,
    externalKey: `checkout:${session.id}`,
    stripeCustomerId: customerId,
    stripeSubscriptionId: null,
    stripeCheckoutSessionId: session.id,
    stripePriceId: priceId,
    status: "active",
    currentPeriodStart: iso(event.created),
    currentPeriodEnd: iso(periodEnd),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    endedAt: null,
  };
}
