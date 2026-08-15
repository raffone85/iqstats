import { parseTeamSeasonQuery, positiveIntegerId } from "@/server/iqstats/query";
import { dataResponse, errorResponse } from "@/server/iqstats/responses";
import { getTeamGateway } from "@/server/iqstats/runtime";
import { requireFeature } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly teamId: string }> };

export async function GET(request: Request, context: Context) {
  const accessError = await requireFeature("match.statistics.read");
  if (accessError) return accessError;

  try {
    const query = parseTeamSeasonQuery(new URL(request.url).searchParams);
    const { teamId: rawTeamId } = await context.params;
    const teamId = positiveIntegerId(rawTeamId);
    return dataResponse(await getTeamGateway().getTeamSeasonSplits(teamId, query));
  } catch (reason) {
    return errorResponse(reason);
  }
}
