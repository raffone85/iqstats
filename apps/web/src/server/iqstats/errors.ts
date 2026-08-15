import type { ApiErrorCode } from "@iqstats/shared";

type GatewayErrorDefinition = {
  readonly status: number;
  readonly retryable: boolean;
  readonly message: string;
};

export const gatewayErrorDefinitions: Readonly<Record<ApiErrorCode, GatewayErrorDefinition>> = {
  invalid_request: {
    status: 400,
    retryable: false,
    message: "La richiesta non rispetta il contratto IQstatS.",
  },
  not_found: {
    status: 404,
    retryable: false,
    message: "La risorsa richiesta non è disponibile.",
  },
  source_not_configured: {
    status: 503,
    retryable: false,
    message: "La fonte dati non è configurata sul server.",
  },
  source_rate_limited: {
    status: 503,
    retryable: true,
    message: "La fonte dati è temporaneamente limitata.",
  },
  source_timeout: {
    status: 504,
    retryable: true,
    message: "La fonte dati non ha risposto entro il tempo previsto.",
  },
  source_unavailable: {
    status: 502,
    retryable: true,
    message: "La fonte dati non è temporaneamente disponibile.",
  },
  source_invalid_response: {
    status: 502,
    retryable: true,
    message: "La fonte dati ha restituito una risposta non utilizzabile.",
  },
  internal_error: {
    status: 500,
    retryable: false,
    message: "Si è verificato un errore interno.",
  },
};

export class GatewayError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode) {
    super(code);
    this.name = "GatewayError";
    this.code = code;
  }
}

export function invalidRequest(): GatewayError {
  return new GatewayError("invalid_request");
}

export function asGatewayError(reason: unknown): GatewayError {
  return reason instanceof GatewayError ? reason : new GatewayError("internal_error");
}
