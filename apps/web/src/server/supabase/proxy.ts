import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/server/config/env";
import type { Database } from "@/server/supabase/database.types";

/**
 * Oltre questo tempo il rinnovo non trattiene la richiesta. Il 14 settembre 2026 Supabase Auth
 * ha risposto dopo 10-18 secondi e il proxy, senza un limite, teneva le pagine in caricamento
 * fino al timeout di 300 secondi della funzione. La richiesta prosegue con i cookie che ha: le
 * pagine protette verificano i claims da sole, quindi nessun controllo salta.
 */
const TEMPO_MASSIMO_RINNOVO_MS = 5_000;

export async function refreshSupabaseSession(request: NextRequest, headers?: Headers) {
  // `headers` sono gli header di richiesta riscritti da chi chiama (il nonce della CSP):
  // devono arrivare a Next attraverso ogni `NextResponse.next`, altrimenti si perdono.
  const prosegui = () => NextResponse.next(headers ? { request: { headers } } : { request });

  // Un prefetch non è una visita: i link di /partite ne aprono decine in parallelo, e se
  // ognuno rinnova la stessa sessione Supabase risponde 409. Si rinnova alla navigazione vera.
  if (request.headers.has("next-router-prefetch")) return prosegui();

  let response = prosegui();
  const supabase = createServerClient<Database>(
    serverEnv.supabaseUrl(),
    serverEnv.supabasePublishableKey(),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = prosegui();
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // This verifies the token and refreshes expired sessions when possible.
  let limite: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    supabase.auth.getClaims(),
    new Promise((fine) => { limite = setTimeout(fine, TEMPO_MASSIMO_RINNOVO_MS); }),
  ]);
  clearTimeout(limite);
  return response;
}
