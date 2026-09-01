import type { ValueVoce } from "@/server/iqstats/value-letture";
import { SOGLIA_VALUE } from "@/server/iqstats/value-letture";

function percento(quota: number): string {
  return `${Math.round(quota * 100)}%`;
}

function edgeTesto(edge: number): string {
  const punti = Math.round(edge * 100);
  if (punti === 0) return "in linea";
  return `${punti > 0 ? "+" : ""}${punti} pt`;
}

export function MatchValueSection({ voci }: { readonly voci: readonly ValueVoce[] }) {
  if (voci.length === 0) return null;
  const sopra = voci.filter((v) => v.edge >= SOGLIA_VALUE);
  const lista = sopra.length > 0 ? sopra : voci.slice(0, 3);

  return (
    <section className="dossier-panel" aria-labelledby="value-title">
      <p className="dossier-kick">Modello contro prezzo</p>
      <h2 id="value-title" className="sr-only-heading">
        Dove il modello e la quota di consenso si separano
      </h2>
      <p className="dossier-verdict-lead">
        {sopra.length === 0
          ? "Nessun esito quotato supera la soglia di tre punti di scarto."
          : `${sopra.length === 1 ? "Un esito" : `${sopra.length} esiti`} sopra la soglia di tre punti.`}
      </p>
      <ul className="engine-rows">
        {lista.map((voce) => (
          <li className="engine-row" key={voce.etichetta}>
            <p className="engine-metric">{voce.etichetta}</p>
            <ul className="engine-splits">
              <li className="engine-split">
                <span className="engine-who">Modello</span>
                <span className="engine-exp">{percento(voce.probabilita)}</span>
              </li>
              <li className="engine-split">
                <span className="engine-who">Quota</span>
                <span className="engine-exp">{voce.quota.toFixed(2).replace(".", ",")}</span>
              </li>
              <li className="engine-split">
                <span className="engine-who">Scarto</span>
                <span className="engine-exp">{edgeTesto(voce.edge)}</span>
                <span className="engine-dettaglio">
                  p × quota − 1{voce.implicita === null ? "" : ` · mercato ${percento(voce.implicita)}`}
                </span>
              </li>
            </ul>
          </li>
        ))}
      </ul>
      <p className="dossier-src">
        Lo scarto è un confronto, non un invito a giocare. La quota è il consenso fra
        operatori, non il prezzo migliore, e nessun bookmaker viene nominato.
      </p>
    </section>
  );
}
