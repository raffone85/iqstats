import type { MercatiGol } from "@/server/iqstats/projection/gol";

function percento(quota: number): string {
  return `${Math.round(quota * 100)}%`;
}

export function MatchMultigolSection({
  partita,
  primoTempo,
  homeTeam,
  awayTeam,
}: {
  readonly partita: MercatiGol;
  readonly primoTempo: MercatiGol;
  readonly homeTeam: string;
  readonly awayTeam: string;
}) {
  const topPartita = [...partita.multigolPartita]
    .sort((a, b) => b.probabilita - a.probabilita)
    .slice(0, 6);
  const top1t = [...primoTempo.multigolPartita]
    .sort((a, b) => b.probabilita - a.probabilita)
    .slice(0, 4);

  return (
    <section className="dossier-panel" aria-labelledby="multigol-title">
      <p className="dossier-kick">Multigol</p>
      <h2 id="multigol-title" className="sr-only-heading">
        Intervalli di gol della gara, delle squadre e del primo tempo
      </h2>
      <ul className="engine-rows">
        <li className="engine-row">
          <p className="engine-metric">Gara, i sei intervalli più densi</p>
          <ul className="engine-ladder" aria-label="Multigol di partita">
            {topPartita.map((i) => (
              <li className="engine-step" key={`g-${i.da}-${i.a}`}>
                <span className="engine-step-line">{i.da}-{i.a}</span>
                <span className="engine-step-prob">{percento(i.probabilita)}</span>
              </li>
            ))}
          </ul>
        </li>
        <li className="engine-row">
          <p className="engine-metric">{homeTeam}</p>
          <ul className="engine-ladder" aria-label={`Multigol ${homeTeam}`}>
            {partita.casa.multigol.map((i) => (
              <li className="engine-step" key={`c-${i.da}-${i.a}`}>
                <span className="engine-step-line">{i.da}-{i.a}</span>
                <span className="engine-step-prob">{percento(i.probabilita)}</span>
              </li>
            ))}
          </ul>
        </li>
        <li className="engine-row">
          <p className="engine-metric">{awayTeam}</p>
          <ul className="engine-ladder" aria-label={`Multigol ${awayTeam}`}>
            {partita.trasferta.multigol.map((i) => (
              <li className="engine-step" key={`t-${i.da}-${i.a}`}>
                <span className="engine-step-line">{i.da}-{i.a}</span>
                <span className="engine-step-prob">{percento(i.probabilita)}</span>
              </li>
            ))}
          </ul>
        </li>
        <li className="engine-row">
          <p className="engine-metric">Primo tempo</p>
          <ul className="engine-ladder" aria-label="Multigol del primo tempo">
            {top1t.map((i) => (
              <li className="engine-step" key={`1t-${i.da}-${i.a}`}>
                <span className="engine-step-line">{i.da}-{i.a}</span>
                <span className="engine-step-prob">{percento(i.probabilita)}</span>
              </li>
            ))}
          </ul>
        </li>
      </ul>
      <p className="dossier-src">
        Stessa distribuzione dei gol attesi, tagliata a intervalli. Casa e ospite sono i
        gol di quella squadra, non il totale. Il 1T usa la quota dichiarata nella sezione
        Primo tempo.
      </p>
    </section>
  );
}
