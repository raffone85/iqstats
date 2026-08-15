import { NextResponse } from "next/server";

import { getLiveDashboardFeed } from "@/lib/bsd";

export const dynamic = "force-dynamic";

export async function GET() {
  const feed = await getLiveDashboardFeed();
  return NextResponse.json(feed);
}
