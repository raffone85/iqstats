// Registro gara per gara di una singola metrica, a supporto della scheda squadra
// pubblica. Stessa natura del proxy immagini: superficie pubblica, dati gia
// normalizzati, nessun segreto coinvolto. Esiste per non stampare in pagina
// sessanta metriche per trentotto gare, che sarebbero megabyte di HTML.
import { TEAM_METRIC_CATALOG, type TeamMetricKey } from "@iqstats/shared";

import { invalidRequest } from "@/server/iqstats/errors";
import { positiveIntegerId } from "@/server/iqstats/query";
import { errorResponse } from "@/server/iqstats/responses";
import { getTeamSplits } from "@/server/iqstats/team-page";

export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly teamId: string }> };

function metricKey(value: string | null): TeamMetricKey {
  const descriptor = TEAM_METRIC_CATALOG.find((candidate) => candidate.key === value);
  if (!descriptor) throw invalidRequest();
  return descriptor.key;
}

export async function GET(request: Request, context: Context) {
  try {
    const { teamId: rawTeamId } = await context.params;
    const teamId = positiveIntegerId(rawTeamId);
    const params = new URL(request.url).searchParams;
    const metric = metricKey(params.get("metric"));
    const seasonId = positiveIntegerId(params.get("seasonId") ?? "");
    const leagueId = positiveIntegerId(params.get("leagueId") ?? "");

    const envelope = await getTeamSplits(teamId, leagueId, seasonId);
    const entries = (envelope?.data?.matchLog ?? []).map((entry) => ({
      eventId: entry.eventId,
      playedAt: entry.playedAt,
      opponentName: entry.opponentName,
      side: entry.side,
      value: entry.values[metric],
      opponentValue: entry.opponentValues[metric],
    }));

    return Response.json(
      { metric, entries },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (reason) {
    return errorResponse(reason);
  }
}
