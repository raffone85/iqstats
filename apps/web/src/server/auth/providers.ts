import "server-only";

import { serverEnv } from "@/server/config/env";

/**
 * Un accesso esterno si mostra solo se è davvero configurato: altrimenti il pulsante
 * porterebbe a una pagina di errore del servizio di autenticazione. La verifica costa
 * una richiesta e viene tenuta in memoria, perché la configurazione cambia di rado.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

let cached: { enabled: boolean; expiresAt: number } | null = null;

export async function isGoogleAccessEnabled(): Promise<boolean> {
  if (cached !== null && cached.expiresAt > Date.now()) return cached.enabled;

  let enabled = false;
  try {
    const url = new URL("/auth/v1/authorize", serverEnv.supabaseUrl());
    url.searchParams.set("provider", "google");
    const response = await fetch(url, { redirect: "manual", cache: "no-store" });
    // Configurato: rimanda al provider. Non configurato: rifiuta la richiesta.
    enabled = response.status >= 300 && response.status < 400;
  } catch {
    enabled = false;
  }

  cached = { enabled, expiresAt: Date.now() + CACHE_TTL_MS };
  return enabled;
}
