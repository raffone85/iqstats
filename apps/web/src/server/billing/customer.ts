import "server-only";

import { getSupabaseAdminClient } from "@/server/supabase/admin";
import { getStripeClient } from "@/server/stripe/client";

export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: readError } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing.stripe_customer_id;

  const customer = await getStripeClient().customers.create(
    { metadata: { iqstats_user_id: userId } },
    { idempotencyKey: `iqstats-customer-${userId}` },
  );
  if (customer.livemode) throw new Error("Unexpected live-mode Stripe customer");

  const { error: writeError } = await supabase.from("billing_customers").upsert({
    user_id: userId,
    stripe_customer_id: customer.id,
  });
  if (writeError) throw writeError;
  return customer.id;
}
