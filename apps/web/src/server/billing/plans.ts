import "server-only";

import { getSupabaseAdminClient } from "@/server/supabase/admin";

export const planCodes = [
  "trial_8_days",
  "insight_monthly",
  "pro_monthly",
  "pro_annual",
] as const;

export type PlanCode = (typeof planCodes)[number];

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === "string" && planCodes.includes(value as PlanCode);
}

export async function getCheckoutPlan(code: PlanCode) {
  const { data, error } = await getSupabaseAdminClient()
    .from("plans")
    .select(
      "code, name, billing_mode, billing_interval, access_duration_days, currency, unit_amount, stripe_price_id, stripe_product_id",
    )
    .eq("code", code)
    .eq("active", true)
    .single();

  if (error || !data?.stripe_price_id || !data.stripe_product_id) {
    throw new Error("Billing plan is not configured");
  }
  return {
    ...data,
    stripe_price_id: data.stripe_price_id,
    stripe_product_id: data.stripe_product_id,
  };
}
