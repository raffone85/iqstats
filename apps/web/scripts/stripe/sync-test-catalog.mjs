import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// Dal 30 agosto 2026 nessun piano si rinnova da solo: si paga un periodo e alla scadenza
// finisce. Nessun `recurring`, quindi ogni prezzo e' a pagamento singolo e ogni piano
// porta la propria durata in giorni. I codici restano quelli: sono chiavi, non etichette.
const plans = [
  { code: "trial_8_days", name: "IQstatS Trial 8 giorni", amount: 100, accessDays: 8 },
  { code: "insight_monthly", name: "IQstatS Insight 30 giorni", amount: 690, accessDays: 30 },
  { code: "pro_monthly", name: "IQstatS Pro 30 giorni", amount: 1290, accessDays: 30 },
  { code: "pro_annual", name: "IQstatS Pro 365 giorni", amount: 10990, accessDays: 365 },
];

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

function isMatchingPrice(price, plan, productId) {
  const product = typeof price.product === "string" ? price.product : price.product.id;
  const interval = price.recurring?.interval;
  return (
    price.active &&
    !price.livemode &&
    product === productId &&
    price.currency === "eur" &&
    price.unit_amount === plan.amount &&
    interval === plan.recurring?.interval &&
    price.type === (plan.recurring ? "recurring" : "one_time")
  );
}

loadLocalEnv();
const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!secretKey?.startsWith("sk_test_")) {
  throw new Error("Refusing to manage Stripe catalog without a test-mode secret key");
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseProjectRef = process.env.SUPABASE_PROJECT_REF?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !supabaseProjectRef || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase server configuration");
}

const parsedSupabaseUrl = new URL(supabaseUrl);
if (parsedSupabaseUrl.hostname !== `${supabaseProjectRef}.supabase.co`) {
  throw new Error("Supabase URL and project reference do not match");
}

const stripe = new Stripe(secretKey);
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const apply = process.argv.includes("--apply");
const [productsPage, pricesPage, databasePlansResult] = await Promise.all([
  stripe.products.list({ active: true, limit: 100 }),
  stripe.prices.list({ active: true, limit: 100 }),
  supabase
    .from("plans")
    .select(
      "code, billing_mode, billing_interval, access_duration_days, currency, unit_amount, stripe_product_id, stripe_price_id",
    )
    .in(
      "code",
      plans.map((plan) => plan.code),
    ),
]);

if (
  productsPage.data.some((product) => product.livemode) ||
  pricesPage.data.some((price) => price.livemode)
) {
  throw new Error("Refusing to continue because a live-mode Stripe object was returned");
}
if (productsPage.has_more || pricesPage.has_more) {
  throw new Error("Stripe catalog exceeds the safe inventory limit");
}
if (databasePlansResult.error) {
  throw new Error("Unable to read the IQstatS plan contract");
}

const databasePlans = databasePlansResult.data ?? [];
if (databasePlans.length !== plans.length) {
  throw new Error("IQstatS plan contract is incomplete");
}

for (const plan of plans) {
  const databasePlan = databasePlans.find((candidate) => candidate.code === plan.code);
  const expectedMode = plan.recurring ? "subscription" : "one_time";
  const expectedInterval = plan.recurring?.interval ?? null;
  const expectedAccessDays = plan.accessDays;
  if (
    !databasePlan ||
    databasePlan.billing_mode !== expectedMode ||
    databasePlan.billing_interval !== expectedInterval ||
    databasePlan.access_duration_days !== expectedAccessDays ||
    databasePlan.currency !== "EUR" ||
    databasePlan.unit_amount !== plan.amount
  ) {
    throw new Error(`IQstatS plan contract mismatch for ${plan.code}`);
  }
}

const result = [];
for (const plan of plans) {
  const matchingProducts = productsPage.data.filter(
    (candidate) =>
      candidate.metadata.iqstats_scope === "commercial_plan" &&
      candidate.metadata.iqstats_plan_code === plan.code,
  );
  if (matchingProducts.length > 1) {
    throw new Error(`Duplicate IQstatS products for ${plan.code}`);
  }
  let product = matchingProducts[0];

  if (!product && apply) {
    product = await stripe.products.create(
      {
        name: plan.name,
        metadata: {
          iqstats_scope: "commercial_plan",
          iqstats_plan_code: plan.code,
        },
      },
      { idempotencyKey: `iqstats-product-${plan.code}-v1` },
    );
  }

  // Il nome del prodotto lo legge chi paga, sulla pagina di Stripe: se resta «mensile»
  // mentre il piano dura trenta giorni, la prima cosa che il cliente vede e' una bugia.
  if (product && apply && product.name !== plan.name) {
    product = await stripe.products.update(product.id, { name: plan.name });
  }

  const matchingPrices = product
    ? pricesPage.data.filter((candidate) => isMatchingPrice(candidate, plan, product.id))
    : [];
  if (matchingPrices.length > 1) {
    throw new Error(`Duplicate IQstatS prices for ${plan.code}`);
  }
  let price = matchingPrices[0];

  if (!price && product && apply) {
    price = await stripe.prices.create(
      {
        product: product.id,
        currency: "eur",
        unit_amount: plan.amount,
        ...(plan.recurring ? { recurring: plan.recurring } : {}),
        metadata: {
          iqstats_scope: "commercial_plan",
          iqstats_plan_code: plan.code,
        },
      },
      { idempotencyKey: `iqstats-price-${plan.code}-una-tantum-v1` },
    );
  }

  result.push({
    planCode: plan.code,
    product,
    price,
    ready: Boolean(product && price),
    mapped:
      Boolean(product && price) &&
      databasePlans.find((candidate) => candidate.code === plan.code)?.stripe_product_id ===
        product?.id &&
      databasePlans.find((candidate) => candidate.code === plan.code)?.stripe_price_id === price?.id,
  });
}

if (apply && result.some((plan) => !plan.ready)) {
  throw new Error("Stripe catalog apply did not produce a complete catalog");
}

if (apply) {
  for (const plan of result) {
    const { error } = await supabase
      .from("plans")
      .update({
        stripe_product_id: plan.product.id,
        stripe_price_id: plan.price.id,
        updated_at: new Date().toISOString(),
      })
      .eq("code", plan.planCode);
    if (error) {
      throw new Error(`Unable to map Stripe catalog for ${plan.planCode}`);
    }
    plan.mapped = true;
  }
}

console.log(
  JSON.stringify(
    {
      mode: "test",
      apply,
      plans: result.map((plan) => ({
        planCode: plan.planCode,
        ready: plan.ready,
        mapped: plan.mapped,
      })),
    },
    null,
    2,
  ),
);
