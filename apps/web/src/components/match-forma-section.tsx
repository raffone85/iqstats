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

function Finestra({ f, forma, dove }: {
  readonly f: FormaDiSquadra["finestre"][number];
  readonly forma: FormaDiSquadra;
  readonly dove: string;
}) {
  return (
    <li className="engine-split">
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
  );
}

function Squadra({ nome, forma, dove }: {
  readonly nome: string;
  readonly forma: FormaDiSquadra;
  readonly dove: string;
}) {
  // **Le tre finestre restano tutte, ma non tutte aperte.** Misurate a 375 px sul dossier
  // del Bundesliga 213683: 382 px per squadra di sole finestre, 764 px sulla card. Aperta
  // resta la piu' larga, che ha il campione maggiore ed e' quella che «dice la squadra»;
  // le altre due, che dicono il momento, stanno a un tocco. Nessuna sparisce: sceglierne
  // una sola e' esattamente quello che la nota qui sotto dice di non voler fare.
  const larga = forma.finestre[forma.finestre.length - 1];
  const corte = forma.finestre.slice(0, -1);
  return (
    <li className="engine-row">
      <p className="engine-metric">{nome}</p>
      <ul className="engine-splits">
        {larga === undefined ? null : <Finestra key={larga.chieste} f={larga} forma={forma} dove={dove} />}
      </ul>
      {corte.length === 0 ? null : (
        <details className="dossier-spiega">
          <summary>
            Le finestre più corte: ultime {corte.map((f) => f.chieste).join(" e ultime ")}
          </summary>
          <ul className="engine-splits">
            {corte.map((f) => <Finestra key={f.chieste} f={f} forma={forma} dove={dove} />)}
          </ul>
        </details>
      )}
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
        cinque stanno in mezzo: tenerne una sola vorrebbe dire scegliere per te quanto
        lontano guardare, e la scelta cambia la risposta. Aperta resta la più larga, che ha
        il campione maggiore; le due più corte stanno a un tocco, e nessuna è stata tolta. Le gare in casa si confrontano con
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
