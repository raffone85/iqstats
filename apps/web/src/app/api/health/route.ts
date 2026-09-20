import { NextResponse } from "next/server";

export function GET() {
  // Niente oltre il battito: dire a chiunque se un token e' configurato e' informazione
  // sul nostro ambiente, e non serve a chi controlla che il servizio risponda.
  return NextResponse.json({ service: "iqstats-web", status: "ok" });
}
