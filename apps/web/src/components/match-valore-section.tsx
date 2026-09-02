import type { MatchPick } from "@/server/iqstats/match-picks";

/**
 * Dove la nostra probabilita' e il prezzo del mercato si separano.
 *
 * **Quattro numeri diversi, e restano diversi.** La probabilita' dice quanto e' probabile
 * l'esito; il margine dice quanti punti stiamo sopra il mercato; l'affidabilita' dice
 * quanto quella previsione ha retto fuori campione; il campione dice su quante gare
 * poggia. Un esito molto probabile puo' non avere margine, un margine puo' non essere
 * solido, e una lettura senza affidabilita' misurata non diventa solida perche' il margine
 * e' grande: la riga li mostra separati apposta.
 *
 * **Il verde compare solo dove il margine e' positivo e l'affidabilita' supera la soglia
 * che l'artefatto dichiara per quel bersaglio.** La soglia non e' scelta qui ne' altrove
 * nel prodotto: viene misurata all'addestramento e viaggia dentro la proiezione.
 *
 * Dove la quota manca, il margine resta un trattino: zero direbbe «modello e mercato
 * concordano», che e' un'altra cosa.
 */
function percento(valore: number | null): string {
  return valore === null ? "—" : `${Math.round(valore)}%`;
}

function quota(valore: number | null): string {
  return valore === null ? "—" : valore.toFixed(2).replace(".", ",");
}

function margine(valore: number | null): string {
  if (valore === null) return "—";
  const arrotondato = Math.round(valore * 10) / 10;
  const segno = arrotondato > 0 ? "+" : arrotondato < 0 ? "−" : "";
  return `${segno}${Math.abs(arrotondato).toFixed(1).replace(".", ",")}`;
}

export function MatchValoreSection({ picks, operatori }: {
  readonly picks: readonly MatchPick[];
  readonly operatori: number;
}) {
  const conMercato = picks.filter((p) => p.marketProbability !== null);
  if (conMercato.length === 0) return null;

  return (
    <section className="dossier-panel valore-panel" aria-labelledby="valore-title">
      <p className="dossier-kick">Dove ci stacchiamo dal mercato</p>
      <h2 id="valore-title" className="squad-section-title">Le letture con il loro margine</h2>
      <ul className="valore-righe">
        {conMercato.map((p) => (
          <li className={p.solida ? "valore-riga valore-solida" : "valore-riga"} key={p.label}>
            <div className="valore-testa">
              <b className="valore-nome">{p.label}</b>
              {/* Il verde solo dove la lettura e' solida, non dove il margine e' positivo.
                  Guardando la cattura del 2 settembre 2026: «+3,0 punti» usciva verde con
                  sotto scritto che l'affidabilita' non bastava a dichiararlo solido, e
                  l'occhio leggeva il contrario del testo. */}
              <span className={p.solida ? "valore-edge valore-su" : "valore-edge"}>
                {margine(p.edge)}
                <i aria-hidden="true"> punti</i>
              </span>
            </div>
            <dl className="valore-numeri">
              <div><dt>modello</dt><dd>{percento(p.probability)}</dd></div>
              <div><dt>mercato</dt><dd>{percento(p.marketProbability)}</dd></div>
              <div><dt>quota</dt><dd>{quota(p.odds)}</dd></div>
              <div>
                <dt>affidabilità</dt>
                <dd>{p.reliability === null ? "non misurata" : Math.round(p.reliability)}</dd>
              </div>
              <div>
                <dt>campione</dt>
                <dd>{p.sample === null ? "—" : `${p.sample} gare`}</dd>
              </div>
            </dl>
            <p className="valore-nota">
              {p.note}.{" "}
              {p.solida
                ? "Il margine è positivo e l’affidabilità supera la soglia misurata per questo bersaglio."
                : p.edge !== null && p.edge > 0
                  ? "Il margine è positivo, ma l’affidabilità non basta a dichiararlo solido."
                  : "Il mercato prezza questo esito almeno quanto lo leggiamo noi."}
            </p>
          </li>
        ))}
      </ul>
      <p className="dossier-src">
        Il margine è la distanza fra la nostra probabilità e quella che il mercato prezza,
        riportata a somma cento su {operatori} operatori per togliere il loro margine. Non è
        un consiglio e non è una quota da giocare: è la misura di quanto le due letture si
        separano, con accanto quanto la nostra ha retto fuori campione.
      </p>
    </section>
  );
}
