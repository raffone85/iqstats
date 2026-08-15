import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "iqstats-web",
    status: "ok",
    bsdConfigured: Boolean(process.env.BSD_API_TOKEN),
  });
}
