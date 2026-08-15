import {
  normalizeEmailCodeAddress,
  publicEmailCodeDeliveryError,
  type EmailCodePublicErrorCode,
} from "@/lib/auth/email-code";
import { isSameOriginRequest } from "@/server/auth/request-origin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

function errorResponse(
  status: 400 | 422 | 429 | 503,
  code: EmailCodePublicErrorCode,
) {
  return Response.json(
    { error: { code } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(400, "invalid_request");
  }

  const payload: unknown = await request.json().catch(() => null);
  if (typeof payload !== "object" || payload === null || !("email" in payload)) {
    return errorResponse(400, "invalid_request");
  }

  const email = normalizeEmailCodeAddress((payload as { email?: unknown }).email);
  if (email === null) return errorResponse(422, "invalid_email");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    const publicError = publicEmailCodeDeliveryError(error);
    return errorResponse(publicError.status, publicError.code);
  }

  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
