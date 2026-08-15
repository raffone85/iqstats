// Proxy immagini PUBBLICO per superfici pubbliche (dashboard "Oggi"): loghi ed
// eventuali foto stadio. L'Image API del provider è senza autenticazione, quindi
// nessun token è coinvolto e l'host del provider non viene esposto al client.
// Reuso il client immagini blindato (allowlist kind, id positivo, cap 5MB, origin lock).
import { asGatewayError, GatewayError, gatewayErrorDefinitions } from "@/server/iqstats/errors";
import { getIqstatsMedia } from "@/server/iqstats/media";
import { providerMediaKinds, type ProviderMediaKind } from "@/server/iqstats/media-client";
import { assertNoQuery, positiveIntegerId } from "@/server/iqstats/query";

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
    // Le immagini del provider sono pubbliche e stabili: cache lato browser.
    "Cache-Control": "public, max-age=86400",
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
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(request: Request, context: Context) {
  try {
    assertNoQuery(new URL(request.url).searchParams);
    const { kind: rawKind, entityId: rawEntityId } = await context.params;
    if (!isProviderMediaKind(rawKind)) return binaryError(new GatewayError("invalid_request"));
    const entityId = positiveIntegerId(rawEntityId);
    const media = await getIqstatsMedia(rawKind, entityId);
    if (media.status === "absent") {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return new Response(media.body, {
      status: 200,
      headers: binaryHeaders(media.contentType),
    });
  } catch (reason) {
    return binaryError(reason);
  }
}
