import "server-only";

import postgres from "postgres";

import { CachedJsonSource } from "./cached-source.ts";
import { DatabaseIqstatsGateway } from "./database-gateway.ts";
import { PostgresFootballDataStore } from "./database-store.ts";
import { GatewayError } from "./errors.ts";
import { IqstatsGateway } from "./gateway-core.ts";
import { HybridIqstatsGateway } from "./hybrid-gateway.ts";
import { ProviderClient } from "./provider-client.ts";

let databaseClient: ReturnType<typeof postgres> | undefined;

function providerClient(): ProviderClient {
  const token = process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN;
  if (!token) throw new GatewayError("source_not_configured");

  const baseUrl =
    process.env.IQSTATS_PROVIDER_BASE_URL ??
    process.env.BSD_API_BASE_URL ??
    "https://sports.bzzoiro.com/api/v2/";

  return new ProviderClient({ baseUrl, token });
}

function providerGateway(): IqstatsGateway {
  return new IqstatsGateway(providerClient());
}

function localDatabaseUrl(): string | null {
  const value = process.env.IQSTATS_DATABASE_URL?.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GatewayError("source_not_configured");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new GatewayError("source_not_configured");
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (
    !loopbackHosts.has(url.hostname) &&
    process.env.IQSTATS_ALLOW_REMOTE_DATABASE !== "true"
  ) {
    throw new GatewayError("source_not_configured");
  }
  return value;
}

function poolSize(): number {
  const configured = Number(process.env.IQSTATS_DATABASE_POOL_MAX ?? "5");
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= 10
    ? configured
    : 5;
}

function databaseGateway(databaseUrl: string): DatabaseIqstatsGateway {
  databaseClient ??= postgres(databaseUrl, {
    max: poolSize(),
    idle_timeout: 20,
    connect_timeout: 5,
    prepare: false,
    connection: {
      application_name: "iqstats-web-data1",
      default_transaction_read_only: true,
      statement_timeout: 5_000,
      role: "iqstats_app_reader",
    },
    onnotice: () => undefined,
  });
  return new DatabaseIqstatsGateway(new PostgresFootballDataStore(databaseClient));
}

export function getIqstatsGateway(): IqstatsGateway | HybridIqstatsGateway {
  const databaseUrl = localDatabaseUrl();
  if (databaseUrl === null) return providerGateway();
  return new HybridIqstatsGateway(databaseGateway(databaseUrl), providerGateway);
}

/**
 * La scheda squadra legge esclusivamente dagli endpoint del provider, mai dal
 * database DATA-1, e passa dalla cache server-side di Next: una gara conclusa si
 * paga una volta sola.
 */
export function getTeamGateway(): IqstatsGateway {
  return new IqstatsGateway(new CachedJsonSource(providerClient()));
}
