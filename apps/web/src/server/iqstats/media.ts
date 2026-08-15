import "server-only";

import {
  ProviderMediaClient,
  type ProviderMediaKind,
} from "./media-client.ts";

const DEFAULT_PROVIDER_BASE_URL = "https://sports.bzzoiro.com/api/v2/";

function providerBaseUrl() {
  return (
    process.env.IQSTATS_PROVIDER_BASE_URL ??
    process.env.BSD_API_BASE_URL ??
    DEFAULT_PROVIDER_BASE_URL
  );
}

export function getIqstatsMedia(kind: ProviderMediaKind, entityId: string) {
  return new ProviderMediaClient({ baseUrl: providerBaseUrl() }).getImage(kind, entityId);
}
