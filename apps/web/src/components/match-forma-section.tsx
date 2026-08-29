import type { FormaDiSquadra } from "@/server/iqstats/projection/forma";

/**
 * La forma in numeri, accanto alla forma in lettere.
 *
 * La sezione «Classifica e forma» mostra la striscia dei risultati, che viene dalla fonte.
 * Questa mostra quanto pesano quei risultati, e viene dalle **nostre** osservazioni: tre
 * vittorie per 1-0 e tre per 4-0 danno la stessa striscia e non sono la stessa squadra.
 * Sono due letture diverse della stessa parola, e la pagina dichiara quale e' quale.
 */
function numero(valore: number): string {
  return valore.toFixed(2).replace(".", ",");
}

/** Quanto una media si stacca dal metro, in percentuale, con il verso. */
function scostamento(valore: number, metro: number): string {
  if (metro <= 0) return "";
  const quota = Math.round(((valore - metro) / metro) * 100);
  return quota === 0 ? "in linea con la competizione"
    : `${quota > 0 ? "+" : ""}${quota}% rispetto alla competizione`;
}

function Squadra({ nome, forma, dove }: {
  readonly nome: string;
  readonly forma: FormaDiSquadra;
  readonly dove: string;
}) {
  return (
    <li className="engine-row">
      <p className="engine-metric">{nome}</p>
      <ul className="engine-splits">
        {forma.finestre.map((f) => (
          <li className="engine-split" key={f.chieste}>
            <span className="engine-who">
              Ultime {f.chieste} {dove}
              {/* Se le gare sono meno di quelle chieste va detto: «ultime 10» su 4 gare
                  e' una media di quattro gare, e chiamarla dieci sarebbe falso. */}
              {f.gare < f.chieste ? (
                <span className="engine-obs">
                  ne abbiamo {f.gare}, non {f.chieste}
                </span>
              ) : null}
            </span>
            <span className="engine-exp">
              {numero(f.retiFatte)}
              <span className="engine-obs">fatte · {scostamento(f.retiFatte, forma.legaFatte)}</span>
              <span className="engine-obs">
                {numero(f.retiSubite)} subite · {scostamento(f.retiSubite, forma.legaSubite)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="engine-why">
        Il metro di questa competizione, dallo stesso lato del campo: <b>{numero(forma.legaFatte)}</b>{" "}
        reti fatte e <b>{numero(forma.legaSubite)}</b> subite a gara, su {forma.campioneLega} gare
        di stagione.
      </p>
    </li>
  );
}

type Props = {
  readonly casa: FormaDiSquadra | null;
  readonly trasferta: FormaDiSquadra | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
};

export function MatchFormaSection({ casa, trasferta, homeTeam, awayTeam }: Props) {
  if (casa === null && trasferta === null) return null;

  return (
    <section className="dossier-panel" aria-labelledby="forma-title">
      <p className="dossier-kick">Forma, in numeri</p>
      <h2 id="forma-title" className="sr-only-heading">
        Reti fatte e subite di recente, contro il metro della competizione
      </h2>

      <ul className="engine-rows">
        {casa === null ? null : <Squadra nome={homeTeam} forma={casa} dove="in casa" />}
        {trasferta === null ? null : (
          <Squadra nome={awayTeam} forma={trasferta} dove="in trasferta" />
        )}
      </ul>

      {/* Le due note spiegano **come** si legge la sezione, e sono uguali su ogni gara: si
          aprono. In pagina resta la tabella, che parla di questa gara. */}
      <details className="dossier-spiega">
        <summary>Come si legge questa sezione</summary>
      <p className="dossier-src">
        <b>Tre finestre e non una.</b> Tre gare dicono il momento, dieci dicono la squadra,
        cinque stanno in mezzo: mostrarne una sola vorrebbe dire scegliere per te quanto
        lontano guardare, e la scelta cambia la risposta. Le gare in casa si confrontano con
        le gare in casa, perché il vantaggio del campo non è un coefficiente da aggiungere
        dopo: mescolare i due lati farebbe di ogni media la media di due cose diverse.
      </p>
      <p className="dossier-src">
        <b>Nessuna soglia, nessuna freccia.</b> Qui non si dichiara una squadra «in forma»
        sopra un numero deciso a tavolino: si mette accanto alla sua media quella della
        competizione, e la distanza si legge. Sono le nostre osservazioni, non la striscia di
        risultati della fonte, che sta nella sezione «Classifica e forma» e risponde a una
        domanda diversa.
      </p>
      </details>
    </section>
  );
}
