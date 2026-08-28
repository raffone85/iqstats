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
        <ul className="contesto-righe">
          {contesto.tessere.map((t) => (
            <li
              className="contesto-riga"
              key={t.bersaglio}
              style={{ "--famiglia": FAMIGLIE[t.bersaglio]?.tinta } as React.CSSProperties}
            >
              <span className="contesto-fam">
                {FAMIGLIE[t.bersaglio]?.nome ?? t.nome}
                {t.chi === null ? null : <em> · {t.chi}</em>}
              </span>
              <span className="contesto-atteso">{t.atteso}</span>
              <span className={`contesto-metro${t.verso === 1 ? " is-sopra" : t.verso === -1 ? " is-sotto" : ""}`}>
                {t.metro === null ? "attesi" : `attesi · lega ${t.metro}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="contesto-riserva">{contesto.riserva}</p>
    </section>
  );
}
