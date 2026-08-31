import Link from "next/link";

/**
 * Una lettura che sta in un piano, detta invece che nascosta.
 *
 * **Perche' non sparisce e basta.** Il repository ha gia' imparato questa lezione con la
 * proiezione: una sezione che se ne va senza una riga si legge come un guasto, e chi
 * guarda non sa se manca il dato, manca il diritto o e' rotto il sito. Qui si dice quale
 * delle tre.
 *
 * **Perche' uno per gruppo e non uno per sezione.** In un dossier da diciannove capitoli
 * le letture del piano Insight sono sette e quelle del piano Pro tre: dieci riquadri di
 * invito uno dietro l'altro non sono un confine, sono un cartellone. Ne compare **uno per
 * piano**, al posto della prima lettura di quel piano, e dentro c'e' scritto per nome
 * tutto quello che quel piano contiene. Chi legge sa esattamente che cosa non sta
 * vedendo, che e' il minimo dovuto a chi deve decidere se pagare.
 *
 * Nessun colore fuori dal sistema, nessun blocco pieno: la quota della pagina e' gia'
 * spesa dalla testata, e un invito che grida piu' del contenuto e' pubblicita'.
 */
export function SezioneRiservata({
  piano,
  id,
  contenuto,
  motivo,
  autenticato,
}: Readonly<{
  /** Il nome commerciale del piano, come compare sulla pagina dei piani. */
  piano: string;
  /** Identificativo del titolo, per l'etichetta della sezione. */
  id: string;
  /**
   * Che cosa contiene il piano, per nome. Non un aggettivo: l'elenco vero.
   *
   * Il titolo dice «le letture del piano» e non «le letture che qui non vedi», perche'
   * alcune dipendono anche dal dato: su una gara senza quote il confronto con il mercato
   * non ci sarebbe comunque, e promettere sette letture per poi darne cinque sarebbe una
   * bugia commerciale, che e' la peggiore specie di bugia in una pagina che vende.
   */
  contenuto: readonly string[];
  /** Perche' questo gruppo sta in quel piano, in una riga. */
  motivo: string;
  /** Chi non ha ancora un account legge un invito diverso da chi ce l'ha. */
  autenticato: boolean;
}>) {
  return (
    <section className="dossier-panel riservata" aria-labelledby={id}>
      <p className="dossier-kick">Nel piano {piano}</p>
      <h2 id={id} className="squad-section-title">
        Le {contenuto.length} letture che aggiunge
      </h2>
      <p className="riservata-motivo">{motivo}</p>
      <ul className="riservata-elenco">
        {contenuto.map((voce) => (
          <li key={voce}>{voce}</li>
        ))}
      </ul>
      <p className="dossier-src">
        {autenticato
          ? "Il tuo accesso attuale non comprende queste letture."
          : "Serve un account, e un piano che le comprenda."}{" "}
        I dati della gara restano liberi: si paga quello che ci mettiamo sopra.
      </p>
      <Link className="button-link" href="/account/billing">
        Vedi i piani
      </Link>
    </section>
  );
}
