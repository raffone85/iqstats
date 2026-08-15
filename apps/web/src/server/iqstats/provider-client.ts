import { GatewayError } from "./errors.ts";

export interface JsonSource {
  getJson(path: string): Promise<unknown>;
}

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ProviderClientOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs?: number;
  readonly fetchImplementation?: FetchImplementation;
}

const DEFAULT_TIMEOUT_MS = 8_000;

export class ProviderClient implements JsonSource {
  readonly #baseUrl: URL;
  readonly #token: string;
  readonly #timeoutMs: number;
  readonly #fetch: FetchImplementation;

  constructor(options: ProviderClientOptions) {
    if (!options.token.trim()) throw new GatewayError("source_not_configured");

    let baseUrl: URL;
    try {
      baseUrl = new URL(options.baseUrl);
    } catch {
      throw new GatewayError("source_not_configured");
    }
    if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
      throw new GatewayError("source_not_configured");
    }

    this.#baseUrl = baseUrl;
    this.#token = options.token;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = options.fetchImplementation ?? fetch;
  }

  async getJson(path: string): Promise<unknown> {
    if (!path.startsWith("/api/v2/") || path.startsWith("//") || path.includes("\\")) {
      throw new GatewayError("internal_error");
    }

    const url = new URL(path, this.#baseUrl);
    if (url.origin !== this.#baseUrl.origin) throw new GatewayError("internal_error");

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "GET",
        headers: { Authorization: `Token ${this.#token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (reason) {
      if (
        reason instanceof DOMException &&
        (reason.name === "AbortError" || reason.name === "TimeoutError")
      ) {
        throw new GatewayError("source_timeout");
      }
      throw new GatewayError("source_unavailable");
    }

    if (response.status === 404) throw new GatewayError("not_found");
    if (response.status === 429) throw new GatewayError("source_rate_limited");
    if (!response.ok) throw new GatewayError("source_unavailable");

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) {
      throw new GatewayError("source_invalid_response");
    }

    try {
      return await response.json();
    } catch {
      throw new GatewayError("source_invalid_response");
    }
  }
}
