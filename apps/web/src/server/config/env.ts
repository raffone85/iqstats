import "server-only";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required server configuration: ${name}`);
  }
  return value;
}

function decodedJwt(value: string): { ref?: string; role?: string } | null {
  const payload = value.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      ref?: string;
      role?: string;
    };
  } catch {
    return null;
  }
}

function validatedSupabaseUrl(): string {
  const value = required("SUPABASE_URL");
  const url = new URL(value);
  const expectedProjectRef = required("SUPABASE_PROJECT_REF");
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid Supabase URL protocol");
  }
  if (
    url.hostname !== `${expectedProjectRef}.supabase.co` ||
    url.protocol !== "https:" ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("Invalid hosted Supabase project URL");
  }
  return url.toString();
}

function validatedSupabaseKey(name: string, expectedRole: "anon" | "service_role") {
  const key = required(name);
  const url = new URL(validatedSupabaseUrl());
  const claims = decodedJwt(key);
  if (url.hostname.endsWith(".supabase.co") && claims) {
    const expectedProjectRef = required("SUPABASE_PROJECT_REF");
    if (claims.ref !== expectedProjectRef || claims.role !== expectedRole) {
      throw new Error("Supabase URL and key configuration do not match");
    }
  }
  return key;
}

export const serverEnv = {
  supabaseUrl: validatedSupabaseUrl,
  supabasePublishableKey: () => validatedSupabaseKey("SUPABASE_ANON_KEY", "anon"),
  supabaseServiceRoleKey: () =>
    validatedSupabaseKey("SUPABASE_SERVICE_ROLE_KEY", "service_role"),
  stripeSecretKey: () => required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => required("STRIPE_WEBHOOK_SECRET"),
  appUrl: () => new URL(required("IQSTATS_APP_URL")),
} as const;
