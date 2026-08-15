import {
  normalizeEmailCode,
  normalizeEmailCodeAddress,
  publicEmailCodeVerificationError,
  type EmailCodePublicErrorCode,
} from "@/lib/auth/email-code";
import { isSameOriginRequest } from "@/server/auth/request-origin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

function localNext(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/partite";
}

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
  if (typeof payload !== "object" || payload === null) {
    return errorResponse(400, "invalid_request");
  }

  const body = payload as { email?: unknown; code?: unknown; next?: unknown };
  const email = normalizeEmailCodeAddress(body.email);
  const code = normalizeEmailCode(body.code);
  if (email === null) return errorResponse(422, "invalid_email");
  if (code === null) return errorResponse(422, "invalid_code");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error) {
    const publicError = publicEmailCodeVerificationError(error);
    return errorResponse(publicError.status, publicError.code);
  }
  if (!data.session) return errorResponse(503, "auth_unavailable");

  return Response.json(
    { ok: true, next: localNext(body.next) },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
