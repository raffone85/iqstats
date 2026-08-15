import { parseSeasonQuery, positiveIntegerId } from "@/server/iqstats/query";
import { dataResponse, errorResponse } from "@/server/iqstats/responses";
import { getIqstatsGateway } from "@/server/iqstats/runtime";
import { requireFeature } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly leagueId: string }> };

export async function GET(request: Request, context: Context) {
  const accessError = await requireFeature("match.history.read");
  if (accessError) return accessError;

  try {
    const { leagueId: rawLeagueId } = await context.params;
    const leagueId = positiveIntegerId(rawLeagueId);
    const seasonId = parseSeasonQuery(new URL(request.url).searchParams);
    return dataResponse(await getIqstatsGateway().getStandings(leagueId, seasonId));
  } catch (reason) {
    return errorResponse(reason);
  }
}
