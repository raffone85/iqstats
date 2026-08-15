export type FeatureKey =
  | "matches.list.read"
  | "matches.detail.read"
  | "method.provenance.read"
  | "odds.snapshot.read"
  | "match.history.read"
  | "match.statistics.read"
  | "match.context.read";

export type AccessDecision =
  | { readonly allowed: true; readonly userId: string }
  | {
      readonly allowed: false;
      readonly status: 401 | 403 | 429 | 503;
      readonly code:
        | "unauthenticated"
        | "feature_not_entitled"
        | "rate_limited"
        | "authorization_unavailable";
      readonly retryAfterSeconds?: number;
    };

export interface AccessDependencies {
  getUserId(): Promise<string | null>;
  hasEntitlement(userId: string, feature: FeatureKey): Promise<boolean>;
}

export async function authorizeFeature(
  feature: FeatureKey,
  dependencies: AccessDependencies,
): Promise<AccessDecision> {
  const userId = await dependencies.getUserId();
  if (!userId) {
    return { allowed: false, status: 401, code: "unauthenticated" };
  }

  try {
    const entitled = await dependencies.hasEntitlement(userId, feature);
    return entitled
      ? { allowed: true, userId }
      : { allowed: false, status: 403, code: "feature_not_entitled" };
  } catch {
    return { allowed: false, status: 503, code: "authorization_unavailable" };
  }
}
