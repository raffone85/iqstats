import { GatewayError } from "./errors.ts";
import type { FetchImplementation } from "./provider-client.ts";

export const providerMediaKinds = ["team", "league", "player", "manager", "venue"] as const;

export type ProviderMediaKind = (typeof providerMediaKinds)[number];

export type ProviderMediaResult =
  | {
      readonly status: "available";
      readonly contentType: "image/png" | "image/webp";
      readonly body: ReadableStream<Uint8Array>;
    }
  | { readonly status: "absent" };

export interface ProviderMediaClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetchImplementation?: FetchImplementation;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isProviderMediaKind(value: string): value is ProviderMediaKind {
  return (providerMediaKinds as readonly string[]).includes(value);
}

function contentType(value: string | null): "image/png" | "image/webp" | null {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  return normalized === "image/png" || normalized === "image/webp" ? normalized : null;
}

function declaredImageSize(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return null;
  const size = Number(value);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

function limitedImageBody(body: ReadableStream<Uint8Array>) {
  let receivedBytes = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > MAX_IMAGE_BYTES) {
          controller.error(new GatewayError("source_invalid_response"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

export class ProviderMediaClient {
  readonly #baseUrl: URL;
  readonly #timeoutMs: number;
  readonly #fetch: FetchImplementation;

  constructor(options: ProviderMediaClientOptions) {
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
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = options.fetchImplementation ?? fetch;
  }

  async getImage(kind: string, entityId: string): Promise<ProviderMediaResult> {
    if (!isProviderMediaKind(kind) || !/^[1-9]\d*$/.test(entityId)) {
      throw new GatewayError("invalid_request");
    }

    const url = new URL(`/img/${kind}/${entityId}/?bg=transparent`, this.#baseUrl);
    if (url.origin !== this.#baseUrl.origin) throw new GatewayError("internal_error");

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "GET",
        headers: { Accept: "image/png,image/webp;q=0.9" },
        cache: "no-store",
        redirect: "error",
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

    if (response.status === 204 || response.status === 404) return { status: "absent" };
    if (response.status === 429) throw new GatewayError("source_rate_limited");
    if (!response.ok) throw new GatewayError("source_unavailable");

    const imageType = contentType(response.headers.get("content-type"));
    const imageSize = declaredImageSize(response.headers.get("content-length"));
    if (!imageType || !response.body || (imageSize !== null && imageSize > MAX_IMAGE_BYTES)) {
      throw new GatewayError("source_invalid_response");
    }

    return {
      status: "available",
      contentType: imageType,
      body: limitedImageBody(response.body),
    };
  }
}
