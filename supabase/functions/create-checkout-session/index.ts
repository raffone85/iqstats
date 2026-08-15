import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import Stripe from "npm:stripe@22.4.0";

type CheckoutPlan = Readonly<{
  code: string;
  billing_mode: "one_time" | "subscription";
  billing_interval: "month" | "year" | null;
  access_duration_days: number | null;
  stripe_price_id: string;
}>;

type CheckoutRequest = Readonly<{ planCode: string }>;

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment: ${name}`);
  return value;
}

function projectKey(legacyName: string, collectionName: string): string {
  const legacy = Deno.env.get(legacyName)?.trim();
  if (legacy) return legacy;

  const rawCollection = requiredEnvironment(collectionName);
  let collection: unknown;
  try {
    collection = JSON.parse(rawCollection);
  } catch {
    throw new Error(`Invalid ${collectionName}`);
  }

  if (
    typeof collection !== "object" ||
    collection === null ||
    !("default" in collection) ||
    typeof collection.default !== "string" ||
    !collection.default.trim()
  ) {
    throw new Error(`Missing default key in ${collectionName}`);
  }

  return collection.default.trim();
}

function configuredAppOrigin(): string {
  const url = new URL(requiredEnvironment("IQSTATS_APP_URL"));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid IQSTATS_APP_URL");
  }
  return url.origin;
}

function corsHeaders(appOrigin: string) {
  return {
    "Access-Control-Allow-Origin": appOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function billingError(
  code: string,
  status: number,
  headers: Record<string, string>,
) {
  return jsonResponse({ error: { code } }, status, headers);
}

function parseCheckoutRequest(value: unknown): CheckoutRequest | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("planCode" in value) ||
    typeof value.planCode !== "string" ||
    !/^[a-z0-9_]+$/.test(value.planCode)
  ) {
    return null;
  }
  return { planCode: value.planCode };
}

function isCheckoutPlan(value: unknown): value is CheckoutPlan {
  if (typeof value !== "object" || value === null) return false;
  const plan = value as Record<string, unknown>;
  const hasValidBillingMode =
    plan.billing_mode === "one_time" || plan.billing_mode === "subscription";
  const hasValidInterval =
    plan.billing_mode === "one_time"
      ? plan.billing_interval === null &&
        typeof plan.access_duration_days === "number" &&
        Number.isInteger(plan.access_duration_days) &&
        plan.access_duration_days > 0
      : plan.billing_interval === "month" || plan.billing_interval === "year";

  return (
    typeof plan.code === "string" &&
    hasValidBillingMode &&
    hasValidInterval &&
    typeof plan.stripe_price_id === "string" &&
    plan.stripe_price_id.startsWith("price_")
  );
}

async function stripeCustomerId(
  stripe: Stripe,
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  const { data: existing, error: readError } = await supabaseAdmin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const customer = await stripe.customers.create(
    { metadata: { iqstats_user_id: userId } },
    { idempotencyKey: `iqstats-customer-${userId}` },
  );
  if (customer.livemode) throw new Error("Unexpected live-mode Stripe customer");

  const { error: writeError } = await supabaseAdmin.from("billing_customers").upsert({
    user_id: userId,
    stripe_customer_id: customer.id,
  });
  if (writeError) throw writeError;
  return customer.id;
}

Deno.serve(async (request) => {
  let appOrigin: string;
  try {
    appOrigin = configuredAppOrigin();
  } catch {
    return new Response(null, { status: 503 });
  }

  const headers = corsHeaders(appOrigin);
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin !== appOrigin) {
    return billingError("origin_not_allowed", 403, headers);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return billingError("method_not_allowed", 405, headers);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return billingError("unauthenticated", 401, headers);
  }
  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken) {
    return billingError("unauthenticated", 401, headers);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return billingError("invalid_json", 400, headers);
  }
  const checkoutRequest = parseCheckoutRequest(body);
  if (!checkoutRequest) return billingError("invalid_plan", 400, headers);

  try {
    const supabaseUrl = requiredEnvironment("SUPABASE_URL");
    const anonymousKey = projectKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
    const serviceRoleKey = projectKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
    const authenticatedClient = createClient(supabaseUrl, anonymousKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: claims, error: claimsError } = await authenticatedClient.auth.getClaims(accessToken);
    const userId = claims?.claims?.sub;
    if (claimsError || typeof userId !== "string" || !userId) {
      return billingError("unauthenticated", 401, headers);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: rawPlan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("code, billing_mode, billing_interval, access_duration_days, stripe_price_id")
      .eq("code", checkoutRequest.planCode)
      .eq("active", true)
      .single();
    if (planError || !isCheckoutPlan(rawPlan)) {
      return billingError("invalid_plan", 400, headers);
    }

    const stripeSecretKey = requiredEnvironment("STRIPE_SECRET_KEY");
    if (!stripeSecretKey.startsWith("sk_test_")) {
      throw new Error("Stripe live mode is not enabled for IQstatS");
    }
    const stripe = new Stripe(stripeSecretKey);
    const customerId = await stripeCustomerId(stripe, supabaseAdmin, userId);
    const metadata = {
      iqstats_user_id: userId,
      iqstats_plan_code: rawPlan.code,
    };
    const session = await stripe.checkout.sessions.create({
      mode: rawPlan.billing_mode === "one_time" ? "payment" : "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: rawPlan.stripe_price_id, quantity: 1 }],
      metadata,
      ...(rawPlan.billing_mode === "subscription"
        ? { subscription_data: { metadata } }
        : {}),
      success_url: new URL("/account/billing?checkout=success", appOrigin).toString(),
      cancel_url: new URL("/account/billing?checkout=canceled", appOrigin).toString(),
    });

    if (!session.url || session.livemode) {
      throw new Error("Unexpected Stripe Checkout session");
    }
    return jsonResponse({ url: session.url }, 201, headers);
  } catch {
    return billingError("checkout_unavailable", 503, headers);
  }
});
