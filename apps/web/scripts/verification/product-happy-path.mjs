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

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function expectOk(url, init = {}) {
  const response = await fetch(url, { redirect: "manual", ...init });
  if (!response.ok) {
    throw new Error(`Expected successful response, received HTTP ${response.status}`);
  }
  return response;
}

loadLocalEnv();
const baseUrl = process.argv[2] ?? "http://127.0.0.1:3108";
const supabaseUrl = required("SUPABASE_URL");
const publishableKey = required("SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const browser = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = randomBytes(10).toString("hex");
const eventId = `evt_${suffix}_product_path`;
let userId;

try {
  const email = `iqstats-product-path-${suffix}@example.invalid`;
  const password = `Iq!${randomBytes(24).toString("base64url")}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw new Error("Unable to create verification user");
  userId = created.user.id;

  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("stripe_price_id")
    .eq("code", "insight_monthly")
    .single();
  if (planError || !plan?.stripe_price_id) {
    throw new Error("Insight plan is not mapped to the Stripe test catalog");
  }

  const now = new Date();
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
      p_external_key: `subscription:sub_${suffix}_product_path`,
      p_stripe_customer_id: `cus_${suffix}_product_path`,
      p_stripe_subscription_id: `sub_${suffix}_product_path`,
      p_stripe_checkout_session_id: null,
      p_stripe_price_id: plan.stripe_price_id,
      p_status: "active",
      p_current_period_start: periodStart.toISOString(),
      p_current_period_end: periodEnd.toISOString(),
      p_cancel_at_period_end: false,
      p_canceled_at: null,
      p_ended_at: null,
    },
  );
  if (billingError || billingResult !== "processed") {
    throw new Error("Unable to materialize the product-path entitlement");
  }

  const { data: signedIn, error: signInError } = await browser.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signedIn.session) throw new Error("Unable to create browser session");

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
  if (sessionError) throw new Error("Unable to materialize SSR cookies");
  const cookie = [...cookieMap].map(([name, value]) => `${name}=${value}`).join("; ");

  const query = "date=2026-07-31&leagueId=9&status=finished";
  const listApiResponse = await expectOk(
    `${baseUrl}/api/iqstats/v1/matches?${query}`,
    { headers: { cookie } },
  );
  if (listApiResponse.headers.get("cache-control") !== "no-store") {
    throw new Error("Match list API is not explicitly no-store");
  }
  const listEnvelope = await listApiResponse.json();
  const selectedMatch = listEnvelope.data?.items?.find((match) => match.id === "7198");
  if (
    !selectedMatch ||
    selectedMatch.homeTeam?.name !== "Coritiba" ||
    selectedMatch.awayTeam?.name !== "Cruzeiro" ||
    listEnvelope.provenance?.sourceKind !== "external-data"
  ) {
    throw new Error("Normalized match list did not contain the verified fixture");
  }

  const listPage = await expectOk(`${baseUrl}/partite?${query}`, { headers: { cookie } });
  const listHtml = await listPage.text();
  if (!listHtml.includes("Coritiba") || !listHtml.includes("Cruzeiro")) {
    throw new Error("Dashboard SSR did not render normalized match data");
  }

  const detailApiResponse = await expectOk(
    `${baseUrl}/api/iqstats/v1/matches/7198`,
    { headers: { cookie } },
  );
  if (detailApiResponse.headers.get("cache-control") !== "no-store") {
    throw new Error("Match detail API is not explicitly no-store");
  }
  const detailEnvelope = await detailApiResponse.json();
  if (
    detailEnvelope.data?.id !== "7198" ||
    detailEnvelope.data?.homeTeam?.name !== "Coritiba" ||
    detailEnvelope.data?.awayTeam?.name !== "Cruzeiro" ||
    detailEnvelope.provenance?.sourceKind !== "external-data"
  ) {
    throw new Error("Normalized match detail did not preserve the verified fixture");
  }

  const detailPage = await expectOk(`${baseUrl}/match/7198?${query}`, {
    headers: { cookie },
  });
  const detailHtml = await detailPage.text();
  if (
    !detailHtml.includes("Coritiba") ||
    !detailHtml.includes("Cruzeiro") ||
    !detailHtml.includes("2026-07-31")
  ) {
    throw new Error("Match dossier SSR did not render data and return context");
  }

  console.log(
    JSON.stringify({
      entitlement: "insight_active",
      listApi: "normalized_no_store",
      dashboard: "rendered",
      detailApi: "normalized_no_store",
      dossier: "rendered_with_return_context",
      providerPersistence: "none",
    }),
  );
} finally {
  await admin.from("billing_events").delete().eq("stripe_event_id", eventId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}
