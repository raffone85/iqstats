import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

async function expectStatus(url, init, expected) {
  const response = await fetch(url, { redirect: "manual", ...init });
  if (response.status !== expected) {
    throw new Error(`Expected HTTP ${expected}, received ${response.status}`);
  }
  return response;
}

loadLocalEnv();
const baseUrl = process.argv[2] ?? "http://127.0.0.1:3107";
const supabaseUrl = required("SUPABASE_URL");
const publishableKey = required("SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const browser = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = randomBytes(8).toString("hex");
const email = `iqstats-verification-${suffix}@example.invalid`;
const password = `Iq!${randomBytes(24).toString("base64url")}`;
const eventId = `evt_iqstats_verification_${suffix}`;
const subscriptionId = `sub_iqstats_verification_${suffix}`;
const customerId = `cus_iqstats_verification_${suffix}`;
const priceId = `price_iqstats_verification_${suffix}`;
let userId;
let originalPriceId = null;

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error("User not created");
  userId = created.user.id;

  const { data: signedIn, error: signInError } = await browser.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signedIn.session) throw signInError ?? new Error("No session");

  const cookieMap = new Map();
  const ssr = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookies) => {
        for (const cookie of cookies) cookieMap.set(cookie.name, cookie.value);
      },
    },
  });
  const { error: sessionError } = await ssr.auth.setSession({
    access_token: signedIn.session.access_token,
    refresh_token: signedIn.session.refresh_token,
  });
  if (sessionError) throw sessionError;
  const cookie = [...cookieMap]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  await expectStatus(
    `${baseUrl}/api/iqstats/v1/matches?date=invalid`,
    { headers: { cookie } },
    403,
  );

  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("stripe_price_id")
    .eq("code", "insight_monthly")
    .single();
  if (planError) throw planError;
  originalPriceId = plan.stripe_price_id;
  const { error: priceError } = await admin
    .from("plans")
    .update({ stripe_price_id: priceId })
    .eq("code", "insight_monthly");
  if (priceError) throw priceError;

  const now = new Date();
  // Keep the synthetic period clearly in the past even if the local and hosted
  // database clocks differ slightly. Real Stripe period timestamps are external.
  const periodStart = new Date(now.getTime() - 5 * 60 * 1000);
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const { data: billingResult, error: billingError } = await admin.rpc(
    "apply_stripe_billing_state",
    {
    p_event_id: eventId,
    p_event_type: "customer.subscription.created",
    p_event_created_at: now.toISOString(),
    p_livemode: false,
    p_user_id: userId,
    p_external_key: `subscription:${subscriptionId}`,
    p_stripe_customer_id: customerId,
    p_stripe_subscription_id: subscriptionId,
    p_stripe_checkout_session_id: null,
    p_stripe_price_id: priceId,
    p_status: "active",
    p_current_period_start: periodStart.toISOString(),
    p_current_period_end: periodEnd.toISOString(),
    p_cancel_at_period_end: false,
    p_canceled_at: null,
    p_ended_at: null,
    },
  );
  if (billingError) throw billingError;
  if (billingResult !== "processed") {
    throw new Error(`Billing state was not applied: ${billingResult}`);
  }

  const { data: entitlementRows, error: entitlementError } = await admin
    .from("entitlements")
    .select("feature_code")
    .eq("user_id", userId);
  if (entitlementError) throw entitlementError;
  if (
    !entitlementRows.some(
      ({ feature_code }) => feature_code === "matches.list.read",
    )
  ) {
    throw new Error("Insight entitlement was not materialized");
  }

  const { data: directEntitlement, error: directEntitlementError } =
    await browser.rpc("has_active_entitlement", {
      p_feature_code: "matches.list.read",
    });
  if (directEntitlementError) throw directEntitlementError;
  if (directEntitlement !== true) {
    const { data: adminEntitlement, error: adminEntitlementError } =
      await admin.rpc("has_active_entitlement", {
        p_feature_code: "matches.list.read",
      });
    if (adminEntitlementError) throw adminEntitlementError;
    const [{ data: directRows, error: directRowsError }, { data: currentUser }] =
      await Promise.all([
        browser
          .from("entitlements")
          .select("feature_code, valid_from, valid_until"),
        browser.auth.getUser(),
      ]);
    if (directRowsError) throw directRowsError;
    const directMatch = directRows.find(
      ({ feature_code }) => feature_code === "matches.list.read",
    );
    const verificationTime = Date.now();
    throw new Error(
      `Authenticated entitlement lookup returned ${JSON.stringify(
        directEntitlement,
      )} (admin lookup: ${JSON.stringify(adminEntitlement)}; user matches: ${
        currentUser.user?.id === userId
      }; visible rows: ${directRows.length}; match visible: ${Boolean(
        directMatch,
      )}; match active: ${Boolean(
        directMatch &&
          Date.parse(directMatch.valid_from) <= verificationTime &&
          Date.parse(directMatch.valid_until) > verificationTime,
      )}; valid from: ${directMatch?.valid_from}; valid until: ${
        directMatch?.valid_until
      }; verifier now: ${new Date(verificationTime).toISOString()})`,
    );
  }

  await expectStatus(
    `${baseUrl}/api/iqstats/v1/matches?date=invalid`,
    { headers: { cookie } },
    400,
  );
  await expectStatus(
    `${baseUrl}/api/iqstats/v1/matches/not-a-number/statistics`,
    { headers: { cookie } },
    403,
  );
  await expectStatus(
    `${baseUrl}/auth/signout`,
    { method: "POST", headers: { cookie } },
    204,
  );

  console.log(
    JSON.stringify({
      authCookie: "verified",
      anonymousOrUnentitled: "denied",
      insightRoute: "allowed_before_validation",
      proOnlyRoute: "denied",
      signout: "verified",
    }),
  );
} finally {
  if (eventId) {
    await admin.from("billing_events").delete().eq("stripe_event_id", eventId);
  }
  await admin
    .from("plans")
    .update({ stripe_price_id: originalPriceId })
    .eq("code", "insight_monthly")
    .eq("stripe_price_id", priceId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}
