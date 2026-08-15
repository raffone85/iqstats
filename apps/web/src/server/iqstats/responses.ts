import type {
  ApiErrorCode,
  ApiErrorEnvelope,
  AvailabilityReason,
  DataEnvelope,
} from "@iqstats/shared";

import { asGatewayError, gatewayErrorDefinitions } from "./errors.ts";

const availabilityReasons: Readonly<Record<ApiErrorCode, AvailabilityReason>> = {
  invalid_request: "validation_failed",
  not_found: "not_captured",
  source_not_configured: "provider_unavailable",
  source_rate_limited: "provider_unavailable",
  source_timeout: "provider_unavailable",
  source_unavailable: "provider_unavailable",
  source_invalid_response: "validation_failed",
  internal_error: "validation_failed",
};

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export function dataResponse<T>(envelope: DataEnvelope<T>): Response {
  return Response.json(envelope, { status: 200, headers: responseHeaders });
}

export function errorResponse(reason: unknown): Response {
  const error = asGatewayError(reason);
  const definition = gatewayErrorDefinitions[error.code];
  const capturedAt = new Date().toISOString();
  const envelope: ApiErrorEnvelope = {
    data: null,
    availability: {
      status: error.code === "not_found" ? "unavailable" : "error",
      reason: availabilityReasons[error.code],
      missingFields: [],
      coverage: null,
    },
    provenance: {
      sourceKind: "external-data",
      capturedAt,
      sourceUpdatedAt: null,
      asOf: null,
    },
    calculation: null,
    error: {
      code: error.code,
      message: definition.message,
      retryable: definition.retryable,
    },
  };
  return Response.json(envelope, { status: definition.status, headers: responseHeaders });
}
