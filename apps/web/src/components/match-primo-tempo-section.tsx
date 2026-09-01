import type { MercatiGol } from "@/server/iqstats/projection/gol";
import { QUOTA_PRIMO_TEMPO } from "@/server/iqstats/projection/gol";

function percento(quota: number): string {
  return `${Math.round(quota * 100)}%`;
}

function valore(numero: number): string {
  return numero.toFixed(2).replace(".", ",");
}

export function MatchPrimoTempoSection({
  mercati,
  homeTeam,
  awayTeam,
}: {
  readonly mercati: MercatiGol;
  readonly homeTeam: string;
  readonly awayTeam: string;
}) {
  const almenoUnGol = 1 - (1 - mercati.casa.almenoUno) * (1 - mercati.trasferta.almenoUno);
  const over15 = mercati.overUnder.find((l) => l.linea === 1.5);
  const massimaEsito = Math.max(mercati.esito.uno, mercati.esito.x, mercati.esito.due);

  return (
    <section className="dossier-panel" aria-labelledby="primo-tempo-title">
      <p className="dossier-kick">Primo tempo</p>
      <h2 id="primo-tempo-title" className="sr-only-heading">
        Gol attesi e mercati del primo tempo
      </h2>
      <ul className="engine-rows">
        <li className="engine-row">
          <p className="engine-metric">Gol attesi in 45&apos;</p>
          <ul className="engine-splits">
            <li className="engine-split">
              <span className="engine-who">{homeTeam}</span>
              <span className="engine-exp">{valore(mercati.casa.attesi)}</span>
            </li>
            <li className="engine-split">
              <span className="engine-who">{awayTeam}</span>
              <span className="engine-exp">{valore(mercati.trasferta.attesi)}</span>
            </li>
            <li className="engine-split">
              <span className="engine-who">Totale 1T</span>
              <span className="engine-exp">{valore(mercati.attesiTotali)}</span>
              <span className="engine-dettaglio">
                {Math.round(QUOTA_PRIMO_TEMPO * 100)}% dei gol attesi di tutta la gara
              </span>
            </li>
          </ul>
        </li>
        <li className="engine-row">
          <p className="engine-metric">Esito 1T</p>
          <ul className="engine-ladder" aria-label="Probabilità 1X2 del primo tempo">
            {([
              ["1", mercati.esito.uno],
              ["X", mercati.esito.x],
              ["2", mercati.esito.due],
            ] as const).map(([etichetta, p]) => (
              <li className={`engine-step${p === massimaEsito ? " is-central" : ""}`} key={etichetta}>
                <span className="engine-step-line">{etichetta}</span>
                <span className="engine-step-prob">{percento(p)}</span>
              </li>
            ))}
          </ul>
        </li>
        <li className="engine-row">
          <p className="engine-metric">Linee 1T</p>
          <ul className="engine-ladder" aria-label="Linee del primo tempo">
            <li className={`engine-step${almenoUnGol >= 0.5 ? " is-central" : ""}`}>
              <span className="engine-step-line">Over 0,5</span>
              <span className="engine-step-prob">{percento(almenoUnGol)}</span>
            </li>
            {over15 ? (
              <li className={`engine-step${over15.sopra >= 0.5 ? " is-central" : ""}`}>
                <span className="engine-step-line">Over 1,5</span>
                <span className="engine-step-prob">{percento(over15.sopra)}</span>
              </li>
            ) : null}
          </ul>
        </li>
      </ul>
      <p className="dossier-src">
        Il primo tempo non ha una colonna propria nelle osservazioni: i gol attesi di
        novanta minuti vengono scalati del {Math.round(QUOTA_PRIMO_TEMPO * 100)}%, la quota
        europea tipica dei gol prima dell&apos;intervallo. Non è la quota misurata di{" "}
        <b>questa</b> gara.
      </p>
    </section>
  );
}
