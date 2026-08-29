import type { GruppoVerifica, VerificaDiGara, VoceVerifica } from "@/server/iqstats/verifica";

import { FAMIGLIE } from "./match-projection-section";

/**
 * Quello che avevamo detto, contro quello che è successo.
 *
 * **Compare solo a gara finita**, e non è una pagella scritta dopo: il motore legge soltanto
 * ciò che esisteva prima del calcio d'inizio, quindi la previsione qui accanto è la stessa
 * che la pagina mostrava prima che si giocasse.
 *
 * **Preso vuol dire dentro l'intervallo dichiarato**, non «vicino». Il modello non promette
 * un numero ma una fascia, e la verifica usa quella.
 */
function numero(v: number): string {
  return v.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

function nomeDi(bersaglio: string): string {
  return FAMIGLIE[bersaglio]?.nome ?? bersaglio;
}

const LATO: Readonly<Record<VoceVerifica["lato"], string>> = {
  casa: "in casa",
  trasferta: "in trasferta",
  totale: "nella gara",
};

function Riga({ voce }: { readonly voce: VoceVerifica }) {
  return (
    <li className={voce.dentro ? "verifica-riga is-presa" : "verifica-riga"}>
      <span className="verifica-cosa">{LATO[voce.lato]}</span>
      <span className="verifica-numeri">
        <b>{numero(voce.atteso)}</b>
        <i>({numero(voce.basso)}–{numero(voce.alto)})</i>
        <span aria-hidden="true">→</span>
        <b className="verifica-reale">{numero(voce.reale)}</b>
      </span>
      <span className="verifica-esito">{voce.dentro ? "dentro" : "fuori"}</span>
    </li>
  );
}

function Gruppo({ gruppo }: { readonly gruppo: GruppoVerifica }) {
  return (
    /* Il parziale sta nel comando, quindi si legge senza aprire: dentro ci sono le tre
       righe che lo compongono. Il conto complessivo e il metodo restano fuori, in chiaro. */
    <details className="verifica-gruppo">
      <summary className="verifica-famiglia">
        <span>{nomeDi(gruppo.bersaglio)}</span>
        <em>{gruppo.presi} su {gruppo.voci.length}</em>
      </summary>
      <ul className="verifica-elenco">
        {gruppo.voci.map((v) => <Riga key={`${v.bersaglio}-${v.lato}`} voce={v} />)}
      </ul>
    </details>
  );
}

export function VerificaSection({ verifica }: { readonly verifica: VerificaDiGara | null }) {
  if (verifica === null) return null;
  return (
    <section className="dossier-panel verifica" aria-labelledby="verifica-title">
      <p className="dossier-kick">Come è andata</p>
      <h2 id="verifica-title" className="squad-section-title">
        Quello che avevamo detto, contro quello che è successo
      </h2>
      <p className="verifica-conto">
        <b>{verifica.presi}</b> previsioni su <b>{verifica.totali}</b> sono cadute dentro
        l&apos;intervallo che avevamo dichiarato.
      </p>
      {verifica.gruppi.map((g) => <Gruppo key={g.bersaglio} gruppo={g} />)}
      <p className="dossier-src">
        Il motore legge soltanto ciò che esisteva <b>prima del calcio d&apos;inizio</b>, e mai
        la gara stessa: la previsione qui accanto è quella che la pagina mostrava prima che si
        giocasse, non una riscritta dopo. «Dentro» vuol dire dentro l&apos;intervallo
        dichiarato, non vicino al valore atteso.
        {verifica.senzaGiudizio.length === 0 ? null : (
          <>
            {" "}
            Restano fuori dal conto {verifica.senzaGiudizio.map(nomeDi).join(", ").toLowerCase()}
            : su questa gara non avevano un intervallo da confrontare, e un bersaglio che non
            si può giudicare non si conta come sbagliato.
          </>
        )}
      </p>
    </section>
  );
}
