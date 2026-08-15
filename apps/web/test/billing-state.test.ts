import assert from "node:assert/strict";
import test from "node:test";

import type Stripe from "stripe";

import {
  normalizeOneTimeCheckout,
  normalizeSubscriptionEvent,
} from "../src/server/billing/state.ts";

const event = {
  id: "evt_test",
  type: "checkout.session.completed",
  created: 1_700_000_000,
  livemode: false,
} as Stripe.Event;

test("normalizes a paid one-time Checkout into an eight-day access window", () => {
  const state = normalizeOneTimeCheckout(
    event,
    {
      id: "cs_test",
      mode: "payment",
      payment_status: "paid",
      customer: "cus_test",
      metadata: { iqstats_user_id: "user-1" },
    } as unknown as Stripe.Checkout.Session,
    "price_test",
    8,
  );

  assert.equal(state.externalKey, "checkout:cs_test");
  assert.equal(
    Date.parse(state.currentPeriodEnd) - Date.parse(state.currentPeriodStart),
    8 * 24 * 60 * 60 * 1000,
  );
  assert.equal(state.status, "active");
});

test("normalizes subscription ownership and item-level billing period", () => {
  const state = normalizeSubscriptionEvent(
    { ...event, type: "customer.subscription.updated" } as Stripe.Event,
    {
      id: "sub_test",
      customer: "cus_test",
      metadata: { iqstats_user_id: "user-1" },
      status: "active",
      cancel_at_period_end: false,
      canceled_at: null,
      ended_at: null,
      items: {
        data: [
          {
            current_period_start: 1_700_000_000,
            current_period_end: 1_702_592_000,
            price: { id: "price_test" },
          },
        ],
      },
    } as unknown as Stripe.Subscription,
  );

  assert.equal(state.externalKey, "subscription:sub_test");
  assert.equal(state.stripePriceId, "price_test");
  assert.equal(state.userId, "user-1");
});
