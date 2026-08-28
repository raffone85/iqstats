import type { Contesto } from "@/server/iqstats/contesto-gara";
import { FAMIGLIE } from "./match-projection-section";

/**
 * Il quadro della gara, in cima al dossier.
 *
 * **Una riga, tre numeri, una riserva.** Sostituisce «In breve», «Verdetto» e «La lettura
 * IQstatS», che dicevano cose sovrapposte in tre pannelli: chi apre la pagina deve capire
 * che gara e' senza leggere paragrafi.
 *
 * Ogni tessera porta l'atteso, il metro con cui va letto - la media delle squadre di questo
 * torneo sui due lati - e la lettura del modello con la sua probabilita'. Verde e mattone
 * stanno solo sullo scarto dal metro, e solo quando supera mezza dispersione: dove non lo
 * supera il numero resta inchiostro, perche' non si distingue.
 */
export function ContestoGara({ contesto }: { readonly contesto: Contesto | null }) {
  if (contesto === null) return null;
  return (
    <section className="dossier-panel contesto" aria-labelledby="contesto-title">
      <p className="dossier-kick">Il quadro della gara</p>
      <h2 id="contesto-title" className="sr-only-heading">
        Che gara è attesa, in una riga e tre numeri
      </h2>
      <p className="contesto-titolo">{contesto.titolo}</p>
      {contesto.favorito === null ? null : (
        <p className="contesto-favorito">{contesto.favorito}</p>
      )}
      {contesto.tessere.length === 0 ? null : (
        <>
          {/* Il riferimento si dichiara una volta, non tre: erano la stessa riga di
              spiegazione ripetuta sotto ogni numero. */}
          <p className="contesto-legenda">
            Attesi in questa gara, contro la media già osservata <b>dallo stesso lato del
            campo</b>. Cambiano da gara a gara: entrano le famiglie in cui il modello si
            scosta di più da quanto è normale qui.
          </p>
          <ul className="contesto-righe">
          {contesto.tessere.map((t) => (
            <li
              className="contesto-riga"
              key={t.bersaglio}
              style={{ "--famiglia": FAMIGLIE[t.bersaglio]?.tinta } as React.CSSProperties}
            >
              <span className="contesto-fam">
                {FAMIGLIE[t.bersaglio]?.nome ?? t.nome}
                <em> · {t.soggetto}</em>
              </span>
              <span className="contesto-atteso">{t.atteso}</span>
              {/* **I due numeri non sono la stessa cosa e si dice.** Il primo e' una
                  previsione di questa gara, il secondo una media gia' osservata sulle
                  squadre di questo campionato, da questo lato del campo. Scriverli
                  entrambi come «attesi» faceva sembrare previsione anche il secondo. */}
              <span className={`contesto-metro${t.verso === 1 ? " is-sopra" : t.verso === -1 ? " is-sotto" : ""}`}>
                {/* «media» e basta si legge come la media della squadra, ed e' l'opposto:
                    e' quella delle squadre del campionato. Il nome per intero, sempre. */}
                {t.metro === null
                  ? "senza un metro con cui confrontarlo"
                  : `media del campionato ${t.metro}`}
              </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="contesto-riserva">{contesto.riserva}</p>
    </section>
  );
}
