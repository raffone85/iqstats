import "server-only";

import type { DataEnvelope } from "@iqstats/shared";
import { headers } from "next/headers";

export type PageApiIssue =
  | "unauthenticated"
  | "not_entitled"
  | "rate_limited"
  | "not_found"
  | "invalid_request"
  | "unavailable";

export type PageApiResult<T> =
  | { readonly kind: "success"; readonly envelope: DataEnvelope<T> }
  | { readonly kind: "issue"; readonly issue: PageApiIssue };

function issueForStatus(status: number, payload: unknown): PageApiIssue {
  const errorCode =
    typeof payload === "object" && payload !== null && "error" in payload
      ? (payload as { error?: { code?: unknown } }).error?.code
      : null;

  if (errorCode === "unauthenticated" || status === 401) return "unauthenticated";
  if (errorCode === "feature_not_entitled" || status === 403) return "not_entitled";
  if (errorCode === "rate_limited" || status === 429) return "rate_limited";
  if (status === 404) return "not_found";
  if (status === 400) return "invalid_request";
  return "unavailable";
}

function isEnvelope(value: unknown): value is DataEnvelope<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    "availability" in value &&
    "provenance" in value
  );
}

export async function getIqstatsPageData<T>(path: string): Promise<PageApiResult<T>> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!host) return { kind: "issue", issue: "unavailable" };

  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol ?? (host.startsWith("localhost") ? "http" : "https");
  const cookie = requestHeaders.get("cookie");
  const response = await fetch(new URL(path, `${protocol}://${host}`), {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) return { kind: "issue", issue: issueForStatus(response.status, payload) };
  if (!isEnvelope(payload)) return { kind: "issue", issue: "unavailable" };

  return { kind: "success", envelope: payload as DataEnvelope<T> };
}
