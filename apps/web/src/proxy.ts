import type { NextRequest } from "next/server";

import { refreshSupabaseSession } from "@/server/supabase/proxy";

export async function proxy(request: NextRequest) {
  // TEMPORANEO (18 settembre 2026, da togliere dopo la misura). /partite riceve ~53
  // richieste al minuto e satura il pooler: i log runtime di Vercel non riportano chi le
  // fa, quindi la riga se la scrive l'applicazione. Solo /partite, solo questi tre campi.
  if (request.nextUrl.pathname === "/partite") {
    console.log("[chi-chiama-partite]", JSON.stringify({
      ua: request.headers.get("user-agent"),
      ip: request.headers.get("x-forwarded-for"),
      query: request.nextUrl.search,
      rsc: request.headers.get("rsc"),
    }));
  }
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/billing/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
