import "server-only";

import { createSupabaseServerClient } from "@/server/supabase/server";

import { isPlanCode, planCodes, type PlanCode } from "./plans";

export type BillingCatalogFeature = Readonly<{
  code: string;
  description: string;
}>;

export type BillingCatalogPlan = Readonly<{
  code: PlanCode;
  name: string;
  billingMode: "one_time" | "subscription";
  billingInterval: "month" | "year" | null;
  accessDurationDays: number | null;
  currency: string;
  unitAmount: number;
  features: readonly BillingCatalogFeature[] | null;
}>;

export type CurrentBillingSubscription = Readonly<{
  planName: string | null;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}>;

export type BillingPageData =
  | Readonly<{ kind: "unauthenticated" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{
      kind: "ready";
      plans: readonly BillingCatalogPlan[];
      currentSubscription: CurrentBillingSubscription | null;
    }>;

type BillingCatalogRow = Readonly<{
  code: string;
  name: string;
  currency: string;
  unit_amount: number;
  feature_code: string | null;
  feature_description: string | null;
} & (
  | Readonly<{
      billing_mode: "one_time";
      billing_interval: null;
      access_duration_days: number;
    }>
  | Readonly<{
      billing_mode: "subscription";
      billing_interval: "month" | "year";
      access_duration_days: null;
    }>
)>;

type MutableBillingCatalogPlan = Omit<BillingCatalogPlan, "features"> & {
  features: BillingCatalogFeature[];
};

function isBillingCatalogRow(value: unknown): value is BillingCatalogRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  const featureIsComplete =
    (row.feature_code === null && row.feature_description === null) ||
    (typeof row.feature_code === "string" && typeof row.feature_description === "string");
  const hasValidBillingShape =
    row.billing_mode === "one_time"
      ? row.billing_interval === null &&
        typeof row.access_duration_days === "number" &&
        Number.isInteger(row.access_duration_days) &&
        row.access_duration_days > 0
      : (row.billing_interval === "month" || row.billing_interval === "year") &&
        row.access_duration_days === null;

  return (
    typeof row.code === "string" &&
    typeof row.name === "string" &&
    typeof row.billing_mode === "string" &&
    (typeof row.billing_interval === "string" || row.billing_interval === null) &&
    hasValidBillingShape &&
    typeof row.currency === "string" &&
    typeof row.unit_amount === "number" &&
    Number.isSafeInteger(row.unit_amount) &&
    row.unit_amount >= 0 &&
    featureIsComplete
  );
}

export async function getBillingPageData(): Promise<BillingPageData> {
  const supabase = await createSupabaseServerClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.claims?.sub) return { kind: "unauthenticated" };

  const [catalogResult, subscriptionResult] = await Promise.all([
    supabase.rpc("get_billing_catalog"),
    supabase
      .from("subscriptions")
      .select("plan_code, current_period_end, cancel_at_period_end")
      .in("status", ["trialing", "active"])
      .gt("current_period_end", new Date().toISOString())
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (
    catalogResult.error ||
    subscriptionResult.error
  ) {
    return { kind: "unavailable" };
  }

  const plansByCode = new Map<PlanCode, MutableBillingCatalogPlan>();
  for (const rawRow of catalogResult.data ?? []) {
    if (!isBillingCatalogRow(rawRow) || !isPlanCode(rawRow.code)) {
      return { kind: "unavailable" };
    }
    const existing = plansByCode.get(rawRow.code);
    if (existing) {
      if (
        existing.name !== rawRow.name ||
        existing.billingMode !== rawRow.billing_mode ||
        existing.billingInterval !== rawRow.billing_interval ||
        existing.accessDurationDays !== rawRow.access_duration_days ||
        existing.currency !== rawRow.currency ||
        existing.unitAmount !== rawRow.unit_amount
      ) {
        return { kind: "unavailable" };
      }
      if (rawRow.feature_code && rawRow.feature_description) {
        existing.features?.push({
          code: rawRow.feature_code,
          description: rawRow.feature_description,
        });
      }
      continue;
    }

    plansByCode.set(rawRow.code, {
      code: rawRow.code,
      name: rawRow.name,
      billingMode: rawRow.billing_mode,
      billingInterval: rawRow.billing_interval,
      accessDurationDays: rawRow.access_duration_days,
      currency: rawRow.currency,
      unitAmount: rawRow.unit_amount,
      features: rawRow.feature_code && rawRow.feature_description
        ? [{ code: rawRow.feature_code, description: rawRow.feature_description }]
        : [],
    });
  }

  const plans: BillingCatalogPlan[] = [];
  for (const code of planCodes) {
    const plan = plansByCode.get(code);
    if (plan) plans.push(plan);
  }

  const subscription = subscriptionResult.data;
  const currentPlan = subscription && isPlanCode(subscription.plan_code)
    ? plansByCode.get(subscription.plan_code)
    : null;

  return {
    kind: "ready",
    plans,
    currentSubscription: subscription
      ? {
          planName: currentPlan?.name ?? null,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        }
      : null,
  };
}
