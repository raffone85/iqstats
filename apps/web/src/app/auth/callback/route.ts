import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

/** Solo destinazioni interne: un `next` assoluto porterebbe la sessione fuori dal sito. */
function localNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/**
 * Ritorno dall'accesso con un provider esterno. Il provider rimanda qui con un codice
 * monouso che va scambiato lato server per la sessione: il token non passa mai dal client.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = localNext(url.searchParams.get("next"));

  // Il provider dichiara qui un rifiuto o un consenso negato: si torna all'accesso con il motivo.
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) {
    const back = new URL("/accedi", url.origin);
    back.searchParams.set("errore", "provider");
    return NextResponse.redirect(back);
  }

  if (!code) {
    const back = new URL("/accedi", url.origin);
    back.searchParams.set("errore", "codice-mancante");
    return NextResponse.redirect(back);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const back = new URL("/accedi", url.origin);
    back.searchParams.set("errore", "scambio");
    return NextResponse.redirect(back);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
