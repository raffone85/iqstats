import { requireAuthenticatedUser } from "@/server/auth/authorization";
import { billingError, safeAppOrigin } from "@/server/billing/http";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import { getStripeClient } from "@/server/stripe/client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const principal = await requireAuthenticatedUser();
  if (principal instanceof Response) return principal;

  try {
    const { data, error } = await getSupabaseAdminClient()
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", principal.userId)
      .single();
    if (error || !data) return billingError(409, "billing_customer_missing");

    const session = await getStripeClient().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: new URL("/account/billing", safeAppOrigin(request)).toString(),
    });
    return Response.json(
      { url: session.url },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return billingError(503, "portal_unavailable");
  }
}
