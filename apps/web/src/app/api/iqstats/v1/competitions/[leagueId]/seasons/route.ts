import { assertNoQuery, positiveIntegerId } from "@/server/iqstats/query";
import { dataResponse, errorResponse } from "@/server/iqstats/responses";
import { getTeamGateway } from "@/server/iqstats/runtime";
import { requireFeature } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly leagueId: string }> };

export async function GET(request: Request, context: Context) {
  const accessError = await requireFeature("matches.list.read");
  if (accessError) return accessError;

  try {
    assertNoQuery(new URL(request.url).searchParams);
    const { leagueId: rawLeagueId } = await context.params;
    const leagueId = positiveIntegerId(rawLeagueId);
    return dataResponse(await getTeamGateway().getSeasons(leagueId));
  } catch (reason) {
    return errorResponse(reason);
  }
}
