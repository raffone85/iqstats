import type {
  DataAvailability,
  DataProvenance,
} from "./common.ts";

export type ApiErrorCode =
  | "invalid_request"
  | "not_found"
  | "source_not_configured"
  | "source_rate_limited"
  | "source_timeout"
  | "source_unavailable"
  | "source_invalid_response"
  | "internal_error";

export interface ApiErrorDescriptor {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ApiErrorEnvelope {
  readonly data: null;
  readonly availability: DataAvailability;
  readonly provenance: DataProvenance;
  readonly calculation: null;
  readonly error: ApiErrorDescriptor;
}
