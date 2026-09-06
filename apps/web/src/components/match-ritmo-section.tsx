import type { RitmoDellaGara } from "@/server/iqstats/ritmo";

/**
 * Da che partita arrivano le due squadre.
 *
 * **Non prevede niente.** Il numero grande di ogni gruppo e' la posizione nel campionato,
 * cioe' quante squadre-gara stanno sotto: e' una misura di dove stanno, non una previsione
 * di dove andranno. Chi prevede resta il motore, e sta in un'altra sezione.
 *
 * **I gruppi sono una lettura, non una misura.** Mettere «tiri» e «occasioni da gol» sotto
 * la stessa voce e' una scelta di chi legge; per questo le metriche restano visibili una
 * per una sotto il gruppo, e il numero del gruppo e' solo la mediana delle loro posizioni.
 */
function percento(quota: number): string {
  return `${Math.round(quota * 100)}%`;
}

function numero(valore: number): string {
  return Number.isInteger(valore) ? String(valore) : valore.toFixed(1).replace(".", ",");
}

/** Il filo della posizione: pieno fin dove sta la squadra. Non aggiunge informazione. */
function Filo({ quota }: { readonly quota: number }) {
  return (
    <span className="ritmo-filo" aria-hidden="true">
      <i style={{ inlineSize: `${Math.round(quota * 100)}%` }} />
    </span>
  );
}

export function MatchRitmoSection({ ritmo, homeTeam, awayTeam }: {
  readonly ritmo: RitmoDellaGara;
  readonly homeTeam: string;
  readonly awayTeam: string;
}) {
  return (
    <section className="dossier-panel ritmo-panel" aria-labelledby="ritmo-title">
      <p className="dossier-kick">Come giocano</p>
      <h2 id="ritmo-title" className="squad-section-title">Il ritmo con cui arrivano</h2>
      <ul className="ritmo-gruppi">
        {ritmo.gruppi.map((g) => (
          <li className="ritmo-gruppo" key={g.gruppo}>
            <details className="ritmo-det">
              <summary className="ritmo-sum">
                <span className="ritmo-nome">{g.nome}</span>
                <span className="ritmo-quote">
                  <span className="ritmo-lato">
                    {homeTeam} <b>{percento(g.posizioneCasa)}</b>
                    <Filo quota={g.posizioneCasa} />
                  </span>
                  <span className="ritmo-lato">
                    {awayTeam} <b>{percento(g.posizioneTrasferta)}</b>
                    <Filo quota={g.posizioneTrasferta} />
                  </span>
                </span>
              </summary>
              <div className="ritmo-voci">
                {g.voci.map((v) => (
                  <div className="ritmo-voce" key={v.nome}>
                    <span className="ritmo-voce-nome">{v.nome}</span>
                    <span className="ritmo-voce-val">{numero(v.casa)}</span>
                    <span className="ritmo-voce-val">{numero(v.trasferta)}</span>
                    <span className="ritmo-voce-val ritmo-voce-lega">{numero(v.lega)}</span>
                  </div>
                ))}
                <p className="ritmo-legenda">
                  I valori sono medie per gara dal lato che si giocherà qui; l’ultima colonna
                  è la mediana del campionato.
                </p>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <p className="dossier-src">
        La percentuale dice quante squadre-gara del campionato stanno sotto, su{" "}
        {ritmo.gareDiLega} righe osservate prima di questa gara. Non è una previsione: è da
        dove arrivano.
        {ritmo.escluse.length > 0
          ? ` Restano fuori ${ritmo.escluse.length} metriche coperte troppo poco in questo campionato: ${ritmo.escluse.map((e) => e.nome).join(", ")}.`
          : ""}
      </p>
    </section>
  );
}
