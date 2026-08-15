import "server-only";

import { createSupabaseServerClient } from "@/server/supabase/server";
import {
  authorizeFeature,
  type AccessDecision,
  type FeatureKey,
} from "@/server/auth/access-policy";

export type { FeatureKey } from "@/server/auth/access-policy";

export async function requireFeature(feature: FeatureKey): Promise<Response | null> {
  const supabase = await createSupabaseServerClient();
  const decision = await authorizeFeature(feature, {
    async getUserId() {
      const { data, error } = await supabase.auth.getClaims();
      return error ? null : (data?.claims?.sub ?? null);
    },
    async hasEntitlement(_userId, requestedFeature) {
      const { data, error } = await supabase.rpc("has_active_entitlement", {
        p_feature_code: requestedFeature,
      });
      if (error) throw error;
      return data === true;
    },
  });

  if (!decision.allowed) return accessErrorResponse(decision);

  const { data: rateLimit, error: rateLimitError } = await supabase.rpc(
    "consume_api_rate_limit",
    { p_bucket: feature },
  );
  if (rateLimitError || !rateLimit?.[0]) {
    return accessErrorResponse({
      allowed: false,
      status: 503,
      code: "authorization_unavailable",
    });
  }
  if (!rateLimit[0].allowed) {
    return accessErrorResponse({
      allowed: false,
      status: 429,
      code: "rate_limited",
      retryAfterSeconds: rateLimit[0].retry_after_seconds,
    });
  }
  return null;
}

export async function requireAuthenticatedUser(): Promise<
  { readonly userId: string } | Response
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = error ? null : data?.claims?.sub;
  if (!userId) {
    return accessErrorResponse({
      allowed: false,
      status: 401,
      code: "unauthenticated",
    });
  }
  return { userId };
}

function accessErrorResponse(decision: Exclude<AccessDecision, { allowed: true }>) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (decision.retryAfterSeconds) {
    headers["Retry-After"] = String(decision.retryAfterSeconds);
  }
  return Response.json(
    { error: { code: decision.code } },
    {
      status: decision.status,
      headers,
    },
  );
}
