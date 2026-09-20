import type { NextRequest } from "next/server";

import { serverEnv } from "@/server/config/env";
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

// **La CSP completa, il punto rimasto aperto dell'audit del 13 settembre 2026.** Gli
// script della pagina sono tutti nostri: Next ne mette una sessantina in linea con i dati
// del server e il checkout di Stripe e' ospitato, quindi non c'e' nessuno script di terzi
// da autorizzare. Il nonce cambia a ogni richiesta e Next lo copia sui propri script
// leggendolo dall'header della richiesta, cosi' 'unsafe-inline' resta fuori da
// `script-src`. Su `style-src` non si puo': le pagine hanno centinaia di attributi
// `style=` (525 su /partite il 20 settembre) e il nonce non copre gli attributi.
function politicaDiSicurezza(nonce: string) {
  // In sviluppo Next valuta codice a runtime e tiene aperto un websocket per il ricarico.
  const sviluppo = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // 'self' e' il ripiego per i browser che non conoscono 'strict-dynamic'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${sviluppo ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${new URL(serverEnv.supabaseUrl()).origin}${sviluppo ? " ws:" : ""}`,
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  if (CRAWLER.test(ua) && !APERTE_AI_CRAWLER.has(request.nextUrl.pathname)) {
    // 429 e non 403: non e' un divieto d'accesso, e' un ritmo che questo sito non regge.
    return new Response("Ritmo non sostenibile per questo sito: vedi /robots.txt", {
      status: 429,
      headers: { "retry-after": "86400", "cache-control": "no-store" },
    });
  }
  const nonce = btoa(crypto.randomUUID());
  const politica = politicaDiSicurezza(nonce);
  const intestazioni = new Headers(request.headers);
  intestazioni.set("x-nonce", nonce);
  intestazioni.set("content-security-policy", politica);

  const risposta = await refreshSupabaseSession(request, intestazioni);
  risposta.headers.set("content-security-policy", politica);
  return risposta;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/billing/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
