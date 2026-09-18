import type { NextRequest } from "next/server";

import { refreshSupabaseSession } from "@/server/supabase/proxy";

// Le pagine che un crawler puo' leggere: raccontano il prodotto e non interrogano il
// livello dati. Tutto il resto, per un crawler, e' una lettura piena del database.
const APERTE_AI_CRAWLER = new Set(["/", "/metodo", "/privacy", "/termini", "/robots.txt"]);

// Misurato il 18 settembre 2026: ClaudeBot enumerava `/partite?date=…&stato=…` una volta
// al secondo, date del 2027 comprese. Ogni combinazione era `cache=MISS`, quindi una
// lettura piena: pooler saturo, letture annullate a 10 s, passata notturna senza
// connessione, e traffico d'uscita Supabase a 13,82 GB contro i 5,5 GB del piano.
// `headlesschrome` resta fuori: le verifiche visive del progetto girano con quello.
const CRAWLER = /bot|crawler|spider|crawling|scrapy/i;

export async function proxy(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  if (CRAWLER.test(ua) && !APERTE_AI_CRAWLER.has(request.nextUrl.pathname)) {
    // 429 e non 403: non e' un divieto d'accesso, e' un ritmo che questo sito non regge.
    return new Response("Ritmo non sostenibile per questo sito: vedi /robots.txt", {
      status: 429,
      headers: { "retry-after": "86400", "cache-control": "no-store" },
    });
  }
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/billing/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
