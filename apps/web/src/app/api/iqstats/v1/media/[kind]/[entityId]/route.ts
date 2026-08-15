import { asGatewayError, GatewayError, gatewayErrorDefinitions } from "@/server/iqstats/errors";
import { getIqstatsMedia } from "@/server/iqstats/media";
import { providerMediaKinds, type ProviderMediaKind } from "@/server/iqstats/media-client";
import { assertNoQuery, positiveIntegerId } from "@/server/iqstats/query";
import { requireFeature } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

type Context = {
  readonly params: Promise<{
    readonly kind: string;
    readonly entityId: string;
  }>;
};

function isProviderMediaKind(value: string): value is ProviderMediaKind {
  return (providerMediaKinds as readonly string[]).includes(value);
}

function binaryHeaders(contentType?: string) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (contentType) headers.set("Content-Type", contentType);
  return headers;
}

function binaryError(reason: unknown) {
  const error = asGatewayError(reason);
  return new Response(null, {
    status: gatewayErrorDefinitions[error.code].status,
    headers: binaryHeaders(),
  });
}

export async function GET(request: Request, context: Context) {
  const accessError = await requireFeature("matches.detail.read");
  if (accessError) return accessError;

  try {
    assertNoQuery(new URL(request.url).searchParams);
    const { kind: rawKind, entityId: rawEntityId } = await context.params;
    if (!isProviderMediaKind(rawKind)) return binaryError(new GatewayError("invalid_request"));
    const entityId = positiveIntegerId(rawEntityId);
    const media = await getIqstatsMedia(rawKind, entityId);
    if (media.status === "absent") {
      return new Response(null, { status: 404, headers: binaryHeaders() });
    }
    return new Response(media.body, {
      status: 200,
      headers: binaryHeaders(media.contentType),
    });
  } catch (reason) {
    return binaryError(reason);
  }
}
