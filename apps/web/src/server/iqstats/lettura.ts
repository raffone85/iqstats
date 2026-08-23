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

import postgres from "postgres";

let cliente: ReturnType<typeof postgres> | undefined;

export function connessione(): ReturnType<typeof postgres> | null {
  const indirizzo = process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim();
  if (!indirizzo) return null;
  cliente ??= postgres(indirizzo, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 5,
    prepare: false,
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
