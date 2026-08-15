import { parseMatchesQuery } from "@/server/iqstats/query";
import { dataResponse, errorResponse } from "@/server/iqstats/responses";
import { getIqstatsGateway } from "@/server/iqstats/runtime";
import { requireFeature } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const accessError = await requireFeature("matches.list.read");
  if (accessError) return accessError;

  try {
    const query = parseMatchesQuery(new URL(request.url).searchParams);
    return dataResponse(await getIqstatsGateway().getMatches(query));
  } catch (reason) {
    return errorResponse(reason);
  }
}
