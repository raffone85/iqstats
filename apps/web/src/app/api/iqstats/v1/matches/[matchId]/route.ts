import { assertNoQuery, positiveIntegerId } from "@/server/iqstats/query";
import { dataResponse, errorResponse } from "@/server/iqstats/responses";
import { getIqstatsGateway } from "@/server/iqstats/runtime";
import { requireFeature } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly matchId: string }> };

export async function GET(request: Request, context: Context) {
  const accessError = await requireFeature("matches.detail.read");
  if (accessError) return accessError;

  try {
    assertNoQuery(new URL(request.url).searchParams);
    const { matchId: rawMatchId } = await context.params;
    const matchId = positiveIntegerId(rawMatchId);
    return dataResponse(await getIqstatsGateway().getMatchDetail(matchId));
  } catch (reason) {
    return errorResponse(reason);
  }
}
