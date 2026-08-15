import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function loadLocalEnv() {
  const contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function expectStatus(url, init, expected) {
  const response = await fetch(url, { redirect: "manual", ...init });
  if (response.status !== expected) {
    throw new Error(`Expected HTTP ${expected}, received ${response.status}`);
  }
  return response;
}

loadLocalEnv();
const baseUrl = process.argv[2] ?? "http://127.0.0.1:3108";
const webhookSecret = required("STRIPE_WEBHOOK_SECRET");
if (!webhookSecret.startsWith("whsec_")) {
  throw new Error("Webhook signing secret is not configured");
}
if (!required("STRIPE_SECRET_KEY").startsWith("sk_test_")) {
  throw new Error("Refusing to verify billing outside Stripe test mode");
}

const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const stripe = new Stripe(required("STRIPE_SECRET_KEY"));
const suffix = randomBytes(10).toString("hex");
const eventIds = [];
let ownerId;
let secondUserId;

function subscription({ id, customerId, userId, priceId, status, start, end }) {
  return {
    id,
    object: "subscription",
    customer: customerId,
    metadata: { iqstats_user_id: userId },
    status,
    cancel_at_period_end: false,
    canceled_at: status === "canceled" ? end : null,
    ended_at: status === "canceled" ? end : null,
    items: {
      object: "list",
      data: [
        {
          id: `si_${suffix}`,
          object: "subscription_item",
          current_period_start: start,
          current_period_end: end,
          price: { id: priceId, object: "price" },
        },
      ],
    },
  };
}

async function postSignedEvent({ eventId, type, created, object, livemode = false }) {
  eventIds.push(eventId);
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    created,
    data: { object },
    livemode,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });
  return expectStatus(
    `${baseUrl}/api/billing/webhook`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body: payload,
    },
    livemode ? 403 : 200,
  );
}

async function readSubscription(externalKey) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("user_id, plan_code, status")
    .eq("external_key", externalKey)
    .single();
  if (error || !data) throw new Error("Unable to read verified subscription state");
  return data;
}

async function entitlementCount(userId) {
  const { count, error } = await admin
    .from("entitlements")
    .select("feature_code", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error || count === null) throw new Error("Unable to count entitlements");
  return count;
}

try {
  const [{ data: owner, error: ownerError }, { data: secondUser, error: secondUserError }] =
    await Promise.all([
      admin.auth.admin.createUser({
        email: `iqstats-billing-owner-${suffix}@example.invalid`,
        password: `Iq!${randomBytes(24).toString("base64url")}`,
        email_confirm: true,
      }),
      admin.auth.admin.createUser({
        email: `iqstats-billing-second-${suffix}@example.invalid`,
        password: `Iq!${randomBytes(24).toString("base64url")}`,
        email_confirm: true,
      }),
    ]);
  if (ownerError || secondUserError || !owner.user || !secondUser.user) {
    throw new Error("Unable to create isolated billing verification users");
  }
  ownerId = owner.user.id;
  secondUserId = secondUser.user.id;

  const { data: plans, error: plansError } = await admin
    .from("plans")
    .select("code, stripe_price_id")
    .in("code", ["insight_monthly", "pro_monthly"]);
  if (plansError || plans?.length !== 2 || plans.some((plan) => !plan.stripe_price_id)) {
    throw new Error("Stripe test catalog is not mapped to IQstatS plans");
  }
  const insightPrice = plans.find((plan) => plan.code === "insight_monthly")?.stripe_price_id;
  const proPrice = plans.find((plan) => plan.code === "pro_monthly")?.stripe_price_id;
  if (!insightPrice || !proPrice) throw new Error("Required plan mappings are unavailable");

  await expectStatus(`${baseUrl}/api/billing/webhook`, { method: "POST", body: "{}" }, 400);
  await expectStatus(
    `${baseUrl}/api/billing/webhook`,
    { method: "POST", headers: { "stripe-signature": "invalid" }, body: "{}" },
    400,
  );

  const now = Math.floor(Date.now() / 1000);
  const periodStart = now - 300;
  const periodEnd = now + 30 * 24 * 60 * 60;
  const subscriptionId = `sub_${suffix}`;
  const customerId = `cus_${suffix}`;
  const externalKey = `subscription:${subscriptionId}`;
  const activeInsight = subscription({
    id: subscriptionId,
    customerId,
    userId: ownerId,
    priceId: insightPrice,
    status: "active",
    start: periodStart,
    end: periodEnd,
  });
  const createdEventId = `evt_${suffix}_created`;
  await postSignedEvent({
    eventId: createdEventId,
    type: "customer.subscription.created",
    created: now,
    object: activeInsight,
  });
  await postSignedEvent({
    eventId: createdEventId,
    type: "customer.subscription.created",
    created: now,
    object: activeInsight,
  });
  let state = await readSubscription(externalKey);
  if (state.user_id !== ownerId || state.plan_code !== "insight_monthly" || state.status !== "active") {
    throw new Error("Initial subscription state is incorrect");
  }
  if ((await entitlementCount(ownerId)) !== 5) {
    throw new Error("Insight entitlement matrix was not materialized");
  }

  await postSignedEvent({
    eventId: `evt_${suffix}_upgrade`,
    type: "customer.subscription.updated",
    created: now + 10,
    object: subscription({
      id: subscriptionId,
      customerId,
      userId: ownerId,
      priceId: proPrice,
      status: "active",
      start: periodStart,
      end: periodEnd,
    }),
  });
  state = await readSubscription(externalKey);
  if (state.plan_code !== "pro_monthly" || (await entitlementCount(ownerId)) !== 7) {
    throw new Error("Upgrade did not apply the Pro entitlement matrix");
  }

  await postSignedEvent({
    eventId: `evt_${suffix}_failed`,
    type: "customer.subscription.updated",
    created: now + 20,
    object: subscription({
      id: subscriptionId,
      customerId,
      userId: ownerId,
      priceId: proPrice,
      status: "past_due",
      start: periodStart,
      end: periodEnd,
    }),
  });
  if ((await entitlementCount(ownerId)) !== 0) {
    throw new Error("Payment failure did not revoke entitlements");
  }

  const crossUserPayload = subscription({
    id: subscriptionId,
    customerId: `cus_${suffix}_other`,
    userId: secondUserId,
    priceId: proPrice,
    status: "active",
    start: periodStart,
    end: periodEnd,
  });
  const crossUserEventId = `evt_${suffix}_cross_user`;
  eventIds.push(crossUserEventId);
  const crossUserBody = JSON.stringify({
    id: crossUserEventId,
    object: "event",
    created: now + 30,
    data: { object: crossUserPayload },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "customer.subscription.updated",
  });
  const crossUserSignature = stripe.webhooks.generateTestHeaderString({
    payload: crossUserBody,
    secret: webhookSecret,
  });
  await expectStatus(
    `${baseUrl}/api/billing/webhook`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": crossUserSignature,
      },
      body: crossUserBody,
    },
    503,
  );
  state = await readSubscription(externalKey);
  if (state.user_id !== ownerId || state.status !== "past_due") {
    throw new Error("Cross-user event changed subscription ownership or state");
  }

  await postSignedEvent({
    eventId: `evt_${suffix}_downgrade`,
    type: "customer.subscription.updated",
    created: now + 40,
    object: subscription({
      id: subscriptionId,
      customerId,
      userId: ownerId,
      priceId: insightPrice,
      status: "active",
      start: periodStart,
      end: periodEnd,
    }),
  });
  state = await readSubscription(externalKey);
  if (state.plan_code !== "insight_monthly" || (await entitlementCount(ownerId)) !== 5) {
    throw new Error("Downgrade did not restore the Insight entitlement matrix");
  }

  await postSignedEvent({
    eventId: `evt_${suffix}_cancel`,
    type: "customer.subscription.deleted",
    created: now + 50,
    object: subscription({
      id: subscriptionId,
      customerId,
      userId: ownerId,
      priceId: insightPrice,
      status: "canceled",
      start: periodStart,
      end: now + 50,
    }),
  });
  state = await readSubscription(externalKey);
  if (state.status !== "canceled" || (await entitlementCount(ownerId)) !== 0) {
    throw new Error("Cancellation did not revoke entitlements");
  }

  await postSignedEvent({
    eventId: `evt_${suffix}_stale`,
    type: "customer.subscription.updated",
    created: now + 5,
    object: activeInsight,
  });
  state = await readSubscription(externalKey);
  if (state.status !== "canceled") {
    throw new Error("Stale event overwrote the latest billing state");
  }

  await postSignedEvent({
    eventId: `evt_${suffix}_live`,
    type: "customer.subscription.updated",
    created: now + 60,
    object: activeInsight,
    livemode: true,
  });

  console.log(
    JSON.stringify({
      signature: "verified",
      replay: "idempotent",
      upgrade: "verified",
      paymentFailure: "revoked",
      crossUser: "rejected",
      downgrade: "verified",
      cancellation: "revoked",
      staleEvent: "ignored",
      liveMode: "rejected",
    }),
  );
} finally {
  if (eventIds.length > 0) {
    await admin.from("billing_events").delete().in("stripe_event_id", eventIds);
  }
  if (ownerId) await admin.auth.admin.deleteUser(ownerId);
  if (secondUserId) await admin.auth.admin.deleteUser(secondUserId);
}
