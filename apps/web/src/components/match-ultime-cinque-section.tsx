import type { ComeSiPresentano, SerieDiLato } from "@/server/iqstats/ultime-cinque";

/**
 * Come si presentano le due squadre: una frase e tre righe.
 *
 * **Si legge in un colpo d'occhio o non serve.** Il verdetto in cima dice che partita
 * ci si aspetta, le tre righe sotto dicono perche', e le gare che stanno dietro sono
 * chiuse: chi vuole i dettagli le apre, chi no non ci inciampa.
 *
 * **La barra e' il peso, non un merito.** Riempie quanto pesa la squadra di casa sulle
 * due medie: e' un confronto, non una classifica. I due numeri stanno scritti ai lati,
 * quindi niente vive solo nel colore. Sono le stesse classi della gara giocata.
 */
const giorno = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });

function quandoBreve(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "" : giorno.format(data);
}

function Gare({ serie, dove }: { readonly serie: SerieDiLato; readonly dove: string }) {
  return (
    <div className="dossier-recent">
      <p className="engine-metric">
        {serie.nome} · {serie.gare.length} {dove}
        <span className="engine-obs">
          {serie.golFatti} gol fatti, {serie.golSubiti} subiti
        </span>
      </p>
      <ul className="engine-splits">
        {serie.gare.map((g) => (
          <li className="engine-split" key={g.quando + g.avversario}>
            <span className="engine-who">{quandoBreve(g.quando)} · {g.avversario}</span>
            <span className="engine-exp">
              {g.golFatti === null || g.golSubiti === null ? "—" : g.golFatti + "-" + g.golSubiti}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MatchUltimeCinqueSection({ confronto, homeTeam, awayTeam }: {
  readonly confronto: ComeSiPresentano | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
}) {
  if (confronto === null) return null;
  const gareCasa = confronto.casa.gare.length;
  const gareFuori = confronto.trasferta.gare.length;

  return (
    <section className="dossier-panel" aria-labelledby="presentano-title">
      <p className="dossier-kick">Come si presentano</p>
      <h2 id="presentano-title" className="squad-section-title">
        {confronto.verdetto ?? "Troppe poche gare in questa stagione per un carattere"}
      </h2>

      <div className="gamestat-heads">
        <span>{homeTeam} · {gareCasa} in casa</span>
        <span>{awayTeam} · {gareFuori} fuori</span>
      </div>
      <div className="gamestat-table">
        {confronto.differenze.map((d) => (
          <div className="gamestat-row" key={d.chiave}>
            <span className="gamestat-val">{d.casa}</span>
            <span className="gamestat-label">{d.nome}</span>
            <span className="gamestat-val gamestat-val-away">{d.trasferta}</span>
            <span className="gamestat-bar" aria-hidden="true">
              <i style={{ width: String(Math.round(d.quotaCasa * 100)) + "%" }} />
            </span>
          </div>
        ))}
      </div>

      <details className="gamestat-more">
        <summary>Le gare che stanno dietro</summary>
        <Gare serie={confronto.casa} dove="in casa" />
        <Gare serie={confronto.trasferta} dove="in trasferta" />
      </details>

      <p className="dossier-src">
        Medie a gara delle ultime {Math.max(gareCasa, gareFuori)} partite di{" "}
        <b>questa stagione</b>, dal lato che si gioca qui: nessun recupero dall&apos;anno
        scorso. In casa si produce di più ovunque, quindi il confronto va letto sapendo
        che i due lati non partono uguali. Sono gare avvenute: i numeri attesi di questa
        partita restano quelli delle Proiezioni.
      </p>
    </section>
  );
}
