import type { StagioniScelte } from "@/server/iqstats/finestra-stagione";

/**
 * Il selettore della finestra: quali stagioni guardano le letture del dossier.
 *
 * **Sono link, non un menu.** La scelta vive nell'indirizzo, quindi non serve
 * JavaScript, funziona senza idratazione, torna indietro con il tasto del browser e un
 * collegamento mostra a un altro esattamente quello che si sta guardando. La stessa
 * forma delle capsule dei capitoli, che sono gia' link e gia' alte 44 px.
 *
 * **Governa tutto il capitolo insieme.** Le sezioni che dipendono dalla stagione leggono la
 * stessa finestra: se ciascuna avesse la sua, due parti della stessa pagina risponderebbero
 * su periodi diversi senza che si veda.
 *
 * **Gli indirizzi li costruisce chi lo usa**, perche' ogni pagina ha i suoi parametri da
 * conservare: il dossier ha solo la gara, la scheda squadra ha anche competizione e
 * stagione, e una funzione qui dentro avrebbe dovuto conoscerli tutti.
 *
 * **«La scorsa» sostituisce, «Tutto» somma.** La prima e' un confronto - come si sono
 * comportate l'anno prima - la seconda un campione piu' largo. Sono due domande diverse
 * e per questo sono due voci e non un interruttore.
 */
export function FinestraStagione({ voci, scelta, cosaGuarda }: {
  readonly voci: readonly { readonly chiave: string; readonly nome: string; readonly href: string }[];
  readonly scelta: StagioniScelte;
  /** Che cosa cambia scegliendo, scritto per la pagina che lo mostra. */
  readonly cosaGuarda: string;
}) {
  return (
    <nav className="finestra-stagione" aria-label="Periodo delle letture di stagione">
      <ul>
        {voci.map((v) => (
          <li key={v.chiave}>
            <a
              href={v.href}
              aria-current={scelta.finestra === v.chiave ? "true" : undefined}
            >
              {v.nome}
            </a>
          </li>
        ))}
      </ul>
      <p className="finestra-stagione-nota">
        {cosaGuarda} <b>{scelta.etichetta}</b>.{" "}
        {scelta.stagioni.length === 0
          ? "Per questa scelta non ci sono gare in archivio, quindi quelle letture non compaiono."
          : "Le altre sezioni non cambiano."}
      </p>
    </nav>
  );
}
