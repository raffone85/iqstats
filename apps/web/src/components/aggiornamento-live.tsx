"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * I punteggi delle gare in corso si aggiornano da soli.
 *
 * **Solo dove c'e' qualcosa da aggiornare.** Senza gare in corso non arma nessun timer e non
 * scrive nulla: una pagina di gare finite non ha punteggi che cambiano, e dichiarare un
 * aggiornamento che non serve e' rumore.
 *
 * **Il ritmo non e' scelto, e' quello della copia.** Il server tiene una copia della risposta
 * del calendario per `MATCHES_TTL_MS`; chiedere piu' spesso restituirebbe gli stessi numeri e
 * mostrerebbe una freschezza che non c'e'. Per questo il valore arriva da li' e non e'
 * scritto due volte.
 *
 * **Si aggiorna la pagina, non il DOM.** `router.refresh()` fa rifare il render al server e
 * lascia che React riconcili: nessun punteggio scritto a mano dentro un nodo, quindi nessuna
 * riga che resta indietro rispetto al resto della gara.
 *
 * ponytail: nessun controllo di `visibilityState`. I browser rallentano gia' i timer nelle
 * schede in secondo piano; se un giorno la misura dicesse che non basta, si aggiunge qui.
 */
export function AggiornamentoLive({
  gareLive,
  ogniMs,
}: Readonly<{ gareLive: number; ogniMs: number }>) {
  const router = useRouter();
  const attivo = gareLive > 0;

  useEffect(() => {
    if (!attivo) return;
    const battito = setInterval(() => router.refresh(), ogniMs);
    return () => clearInterval(battito);
  }, [attivo, ogniMs, router]);

  if (!attivo) return null;

  const minuti = Math.round(ogniMs / 60_000);
  const ritmo = minuti === 1 ? "ogni minuto" : `ogni ${minuti} minuti`;

  return (
    <p className="aggiornamento-live" role="status" aria-live="polite">
      <b>
        {gareLive === 1 ? "Una gara è in corso" : `${gareLive} gare sono in corso`}.
      </b>{" "}
      Il punteggio si aggiorna da solo <b>{ritmo}</b>, senza ricaricare: è quanto dura la
      copia che teniamo della fonte, e chiederla più spesso restituirebbe gli stessi numeri.
    </p>
  );
}
