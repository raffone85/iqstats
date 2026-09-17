import "server-only";

import { serverEnv } from "@/server/config/env";

/**
 * Un accesso esterno si mostra solo se è davvero configurato: altrimenti il pulsante
 * porterebbe a una pagina di errore del servizio di autenticazione. La verifica costa
 * una richiesta e viene tenuta in memoria, perché la configurazione cambia di rado.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * La sonda non puo' trattenere la pagina.
 *
 * Misurato il 16 settembre 2026: `/auth/v1/authorize?provider=google` rispondeva **522 dopo
 * venti secondi** (20,1 · 19,8 · 19,6 su tre prove), e `/accedi` ci stava dietro a ogni
 * disegno, perche' la memoria dura dieci minuti e vale per una istanza sola. Un pulsante
 * d'accesso non vale l'attesa della pagina: oltre il tempo massimo si conclude che non e'
 * configurato e si mostra l'accesso via email, che c'e' sempre.
 */
const TEMPO_MASSIMO_SONDA_MS = 2_000;

let cached: { enabled: boolean; expiresAt: number } | null = null;
/** La sonda in corso: una sola alla volta, così dieci richieste insieme non fanno dieci prove. */
let inCorso: Promise<boolean> | null = null;

/**
 * Se l'accesso con Google e' configurato, per quanto ne sappiamo **adesso**.
 *
 * Non aspetta la sonda: risponde con quello che sa e, quando la memoria e' scaduta, manda
 * avanti la prova per la richiesta successiva. Senza risposta si dice di no, e resta
 * l'accesso via email. Il prezzo e' che un Google appena configurato compare dalla visita
 * dopo, invece che da questa: molto meno di venti secondi di pagina ferma.
 */
export function isGoogleAccessEnabled(): boolean {
  if (cached !== null && cached.expiresAt > Date.now()) return cached.enabled;
  if (inCorso === null) inCorso = sonda().finally(() => { inCorso = null; });
  return cached?.enabled ?? false;
}

async function sonda(): Promise<boolean> {
  let enabled = false;
  try {
    const url = new URL("/auth/v1/authorize", serverEnv.supabaseUrl());
    url.searchParams.set("provider", "google");
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_MASSIMO_SONDA_MS),
    });
    // Configurato: rimanda al provider. Non configurato: rifiuta la richiesta.
    enabled = response.status >= 300 && response.status < 400;
  } catch {
    enabled = false;
  }

  cached = { enabled, expiresAt: Date.now() + CACHE_TTL_MS };
  return enabled;
}
