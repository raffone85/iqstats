// Server-only: l'unica connessione in sola lettura al livello dati di IQstatS.
//
// Stava dentro `projection-runtime.ts` e serviva solo al motore. Dal 23 agosto la legge
// anche l'area Arbitri, e due moduli che aprono due pool sulla stessa tavola sono due
// pool di troppo: la connessione vive qui, il pool resta uno.
//
// **I confini non cambiano.** Sola lettura dichiarata sulla sessione, ruolo dedicato,
// timeout breve, e nessuna variabile nuova: resta `IQSTATS_PROJECTION_DATABASE_URL`, non
// `IQSTATS_DATABASE_URL`, perche' quest'ultima farebbe passare all'ibrido *tutta*
// l'applicazione, che e' una decisione di un altro livello. Senza la variabile non si
// legge e non si finge: chi chiama riceve `null` e la sua sezione non compare.
import "server-only";

import { unstable_cache } from "next/cache";
import postgres from "postgres";

let cliente: ReturnType<typeof postgres> | undefined;

/**
 * Quanto resta valida una lettura in cache: i dati cambiano una volta a notte.
 *
 * Deciso il 17 settembre 2026 dopo la misura: un'apertura del dossier faceva 42 query al
 * livello dati (29 diverse, 301 ms in locale) e ogni visita le rifaceva tutte, anche sulla
 * stessa gara; all'ora di pranzo quelle query diventavano da 10 a 64 s in coda sul pooler.
 */
const SEI_ORE = 6 * 60 * 60;

/** Un risultato vuoto non si mette in cache: puo' essere una lettura annullata dal tetto. */
class NullaDaConservare extends Error {
  readonly risultato: unknown;
  constructor(risultato: unknown) {
    super("risultato da non conservare");
    this.risultato = risultato;
  }
}

/**
 * La stessa funzione di lettura, con il risultato condiviso fra visite e istanze.
 *
 * **Un `null` non entra in cache.** Con il database sotto carico una lettura oltre i 10 s
 * viene annullata e la funzione risponde `null`: conservarlo toglierebbe la sezione per sei
 * ore. Si rilegge alla visita dopo.
 *
 * **Fuori da Next si legge e basta.** Script offline e test chiamano le stesse funzioni, e
 * li' `unstable_cache` non ha dove scrivere («incrementalCache missing»).
 *
 * Il risultato passa da JSON: niente `Map`, `Set` o `Date` in quello che si conserva.
 */
export function inCache<A extends unknown[], R>(
  nome: string,
  leggi: (...argomenti: A) => Promise<R>,
  /** Quali risultati non conservare: il `null`, e dove serve un codice d'errore. */
  daNonConservare: (risultato: R) => boolean = (risultato) => risultato === null,
): (...argomenti: A) => Promise<R> {
  const conservata = unstable_cache(
    async (...argomenti: A) => {
      const risultato = await leggi(...argomenti);
      if (daNonConservare(risultato)) throw new NullaDaConservare(risultato);
      return risultato;
    },
    ["livello-dati", nome],
    { revalidate: SEI_ORE },
  );
  return async (...argomenti: A) => {
    try {
      return await conservata(...argomenti);
    } catch (errore) {
      if (errore instanceof NullaDaConservare) return errore.risultato as R;
      if (errore instanceof Error && errore.message.includes("incrementalCache missing")) {
        return leggi(...argomenti);
      }
      throw errore;
    }
  };
}

export function connessione(): ReturnType<typeof postgres> | null {
  const indirizzo = process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim();
  if (!indirizzo) return null;
  cliente ??= postgres(indirizzo, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 5,
    prepare: false,
    // **Il catalogo dei tipi si legge.** Toglierlo con `fetch_types: false` risparmiava 381
    // righe di `pg_type` per connessione, ma senza quelle righe postgres.js non sa
    // serializzare un array: `= any($1::bigint[])` partiva come stringa e il database
    // rispondeva «malformed array literal». Misurato il 18 settembre 2026 su
    // `nomiDelleSquadre`, che e' nel percorso di ogni dossier.
    connection: {
      application_name: "iqstats-lettura",
      default_transaction_read_only: true,
      statement_timeout: 10_000,
      role: "iqstats_app_reader",
    },
    onnotice: () => undefined,
  });
  return cliente;
}
