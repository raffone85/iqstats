import type { StagioniScelte } from "@/server/iqstats/finestra-stagione";

/**
 * Il selettore della finestra: quali stagioni guardano le letture del dossier.
 *
 * **Sono link, non un menu.** La scelta vive nell'indirizzo, quindi non serve
 * JavaScript, funziona senza idratazione, torna indietro con il tasto del browser e un
 * collegamento mostra a un altro esattamente quello che si sta guardando. La stessa
 * forma delle capsule dei capitoli, che sono gia' link e gia' alte 44 px.
 *
 * **Governa tutto il capitolo insieme.** Assetto, quando spingono, come si presentano e
 * il ritmo per tempo leggono la stessa finestra: se ciascuno avesse la sua, due sezioni
 * della stessa pagina risponderebbero su periodi diversi senza che si veda.
 *
 * **«La scorsa» sostituisce, «Tutto» somma.** La prima e' un confronto - come si sono
 * comportate l'anno prima - la seconda un campione piu' largo. Sono due domande diverse
 * e per questo sono due voci e non un interruttore.
 */
export function FinestraStagione({ matchId, scelta }: {
  readonly matchId: string;
  readonly scelta: StagioniScelte;
}) {
  // «corrente» e' il valore predefinito: il suo collegamento non porta il parametro,
  // cosi' l'indirizzo condiviso piu' spesso resta quello pulito.
  const voci = [
    { chiave: "corrente", nome: "Questa stagione", href: `/match/${matchId}` },
    { chiave: "scorsa", nome: "La scorsa", href: `/match/${matchId}?stagione=scorsa` },
    { chiave: "tutto", nome: "Tutto l'archivio", href: `/match/${matchId}?stagione=tutto` },
  ] as const;

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
        Assetto, quando spingono, come si presentano e il ritmo per tempo guardano{" "}
        <b>{scelta.etichetta}</b>.{" "}
        {scelta.stagioni.length === 0
          ? "Per questa scelta non ci sono gare in archivio, quindi quelle letture non compaiono."
          : "Le altre sezioni non cambiano."}
      </p>
    </nav>
  );
}
