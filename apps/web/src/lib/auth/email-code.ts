export const emailCodePublicErrorCodes = [
  "invalid_request",
  "invalid_email",
  "invalid_code",
  "email_delivery_restricted",
  "rate_limited",
  "auth_unavailable",
] as const;

export type EmailCodePublicErrorCode = (typeof emailCodePublicErrorCodes)[number];

export interface EmailCodePublicError {
  readonly code: EmailCodePublicErrorCode;
  readonly status: 400 | 422 | 429 | 503;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const EMAIL_CODE_PATTERN = /^\d{6}$/u;

function supabaseErrorCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : null;
}

export function normalizeEmailCodeAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function normalizeEmailCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return EMAIL_CODE_PATTERN.test(code) ? code : null;
}

export function isEmailCodePublicErrorCode(
  value: unknown,
): value is EmailCodePublicErrorCode {
  return (
    typeof value === "string" &&
    (emailCodePublicErrorCodes as readonly string[]).includes(value)
  );
}

export function publicEmailCodeDeliveryError(error: unknown): EmailCodePublicError {
  switch (supabaseErrorCode(error)) {
    case "email_address_invalid":
      return { code: "invalid_email", status: 422 };
    case "email_address_not_authorized":
      return { code: "email_delivery_restricted", status: 503 };
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return { code: "rate_limited", status: 429 };
    default:
      return { code: "auth_unavailable", status: 503 };
  }
}

export function publicEmailCodeVerificationError(error: unknown): EmailCodePublicError {
  switch (supabaseErrorCode(error)) {
    case "otp_expired":
    case "token_expired":
    case "validation_failed":
      return { code: "invalid_code", status: 422 };
    case "over_request_rate_limit":
      return { code: "rate_limited", status: 429 };
    default:
      return { code: "auth_unavailable", status: 503 };
  }
}
