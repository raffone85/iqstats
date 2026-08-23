// Sezione "Gol" del dossier: gol attesi delle due squadre e i mercati che ne discendono.
//
// Non calcola nulla: riceve dal server i mercati già prodotti. Riusa per intero le classi
// del pannello del motore — `engine-*` — così non nasce CSS nuovo e le due sezioni si
// leggono con lo stesso occhio.
//
// Ogni scala evidenzia la voce più probabile. È una lettura, non un consiglio di giocata:
// il limite del modello sta scritto in fondo alla sezione, non solo nel codice.
import type { GolDellaGara } from "@/server/iqstats/projection-runtime";
import type { Intervallo } from "@/server/iqstats/projection/gol";

function valore(numero: number): string {
  return numero.toFixed(2).replace(".", ",");
}

function percento(quota: number): string {
  return String(Math.round(quota * 100)) + "%";
}

/** Una gara, non «1 gare»: il campione si legge in italiano. */
function gare(quante: number, dove: string): string {
  return `${quante} ${quante === 1 ? "gara" : "gare"} ${dove}`;
}

interface Voce {
  readonly etichetta: string;
  readonly probabilita: number;
}

/**
 * Una scala di voci con la più probabile in evidenza.
 *
 * L'evidenza non è affidata al solo colore: la voce in testa porta anche il bordo e il
 * peso del carattere, come vuole il master del design system.
 */
function Scala({ voci, titolo }: { readonly voci: readonly Voce[]; readonly titolo: string }) {
  const massima = voci.reduce((piu, voce) => (voce.probabilita > piu ? voce.probabilita : piu), 0);
  return (
    <ul className="engine-ladder" aria-label={titolo}>
      {voci.map((voce) => (
        <li
          className={`engine-step${voce.probabilita === massima ? " is-central" : ""}`}
          key={voce.etichetta}
        >
          <span className="engine-step-line">{voce.etichetta}</span>
          <span className="engine-step-prob">{percento(voce.probabilita)}</span>
        </li>
      ))}
    </ul>
  );
}

function Riga({ titolo, children }: {
  readonly titolo: string;
  readonly children: React.ReactNode;
}) {
  return (
    <li className="engine-row">
      <p className="engine-metric">{titolo}</p>
      {children}
    </li>
  );
}

function daIntervalli(intervalli: readonly Intervallo[]): Voce[] {
  return intervalli.map((i) => ({
    etichetta: `${i.da}-${i.a}`,
    probabilita: i.probabilita,
  }));
}

type Props = {
  readonly gol: GolDellaGara;
  readonly homeTeam: string;
  readonly awayTeam: string;
};

export function MatchGolSection({ gol, homeTeam, awayTeam }: Props) {
  const m = gol.mercati;
  const esatti = (quali: readonly number[]): Voce[] =>
    quali.map((probabilita, gol) => ({ etichetta: `${gol}`, probabilita }));

  return (
    <section className="dossier-panel" aria-labelledby="gol-title">
      <p className="dossier-kick">Gol</p>
      <h2 id="gol-title" className="sr-only-heading">
        Gol attesi e mercati che ne discendono
      </h2>

      <ul className="engine-rows">
        <Riga titolo="Gol attesi">
          <ul className="engine-splits">
            <li className="engine-split">
              <span className="engine-who">{homeTeam}</span>
              <span className="engine-exp">
                {valore(m.casa.attesi)}
                <span className="engine-obs">
                  fra {m.casa.minimo} e {m.casa.massimo} gol · {gare(gol.campioneCasa, "in casa")}
                </span>
              </span>
            </li>
            <li className="engine-split">
              <span className="engine-who">{awayTeam}</span>
              <span className="engine-exp">
                {valore(m.trasferta.attesi)}
                <span className="engine-obs">
                  fra {m.trasferta.minimo} e {m.trasferta.massimo} gol ·{" "}
                  {gare(gol.campioneTrasferta, "fuori casa")}
                </span>
              </span>
            </li>
            <li className="engine-split">
              <span className="engine-who">Totale gara</span>
              <span className="engine-exp">
                {valore(m.attesiTotali)}
                <span className="engine-obs">
                  fra {m.totaliMinimo} e {m.totaliMassimo} gol
                </span>
              </span>
            </li>
          </ul>
        </Riga>

        <Riga titolo="Esito finale">
          <Scala
            titolo="Probabilità dei tre esiti"
            voci={[
              { etichetta: "1", probabilita: m.esito.uno },
              { etichetta: "X", probabilita: m.esito.x },
              { etichetta: "2", probabilita: m.esito.due },
            ]}
          />
        </Riga>

        <Riga titolo="Doppia chance">
          <Scala
            titolo="Probabilità delle doppie chance"
            voci={[
              { etichetta: "1X", probabilita: m.doppiaChance.unoX },
              { etichetta: "X2", probabilita: m.doppiaChance.xDue },
              { etichetta: "12", probabilita: m.doppiaChance.unoDue },
            ]}
          />
        </Riga>

        <Riga titolo="Gol totali, sopra la linea">
          <Scala
            titolo="Probabilità di superare ciascuna linea"
            voci={m.overUnder.map((linea) => ({
              etichetta: `Over ${String(linea.linea).replace(".", ",")}`,
              probabilita: linea.sopra,
            }))}
          />
        </Riga>

        <Riga titolo="Entrambe le squadre segnano">
          <Scala
            titolo="Probabilità che segnino entrambe"
            voci={[
              { etichetta: "Sì", probabilita: m.gg },
              { etichetta: "No", probabilita: m.ng },
            ]}
          />
        </Riga>

        <Riga titolo="Quanti gol segna ciascuna">
          <ul className="engine-splits">
            <li className="engine-split">
              <span className="engine-who">{homeTeam}</span>
              <span className="engine-exp">{percento(m.casa.almenoUno)}</span>
              <Scala titolo={`Gol esatti di ${homeTeam}`} voci={esatti(m.casa.esatti)} />
            </li>
            <li className="engine-split">
              <span className="engine-who">{awayTeam}</span>
              <span className="engine-exp">{percento(m.trasferta.almenoUno)}</span>
              <Scala titolo={`Gol esatti di ${awayTeam}`} voci={esatti(m.trasferta.esatti)} />
            </li>
          </ul>
        </Riga>

        <Riga titolo="I cinque risultati più probabili">
          <Scala
            titolo="Risultati esatti più probabili"
            voci={m.risultati.map((r) => ({
              etichetta: `${r.casa}-${r.trasferta}`,
              probabilita: r.probabilita,
            }))}
          />
        </Riga>

        <Riga titolo="Multigol">
          <ul className="engine-splits">
            <li className="engine-split">
              <span className="engine-who">Totale gara</span>
              <span className="engine-exp" aria-hidden="true" />
              <Scala titolo="Multigol di partita" voci={daIntervalli(m.multigolPartita)} />
            </li>
            <li className="engine-split">
              <span className="engine-who">{homeTeam}</span>
              <span className="engine-exp" aria-hidden="true" />
              <Scala titolo={`Multigol di ${homeTeam}`} voci={daIntervalli(m.casa.multigol)} />
            </li>
            <li className="engine-split">
              <span className="engine-who">{awayTeam}</span>
              <span className="engine-exp" aria-hidden="true" />
              <Scala titolo={`Multigol di ${awayTeam}`} voci={daIntervalli(m.trasferta.multigol)} />
            </li>
          </ul>
        </Riga>
      </ul>

      <p className="dossier-src">
        I gol attesi nascono dai <b>gol attesi osservati</b> nelle gare già giocate in questa
        stagione: quanto ciascuna squadra ne produce dal suo lato del campo, per quanto
        l&apos;avversaria ne concede dal proprio, misurati contro la media della competizione
        &mdash; {gol.campioneLega} righe di lega, {gare(gol.campioneCasa, "in casa")} e{" "}
        {gol.campioneTrasferta} fuori. Il vantaggio del campo non è un coefficiente aggiunto a
        mano: sta nelle due medie di lega, che sono diverse perché misurate sui due lati.
      </p>
      <p className="dossier-src">
        <b>Con poche gare il numero resta vicino alla media della competizione</b>, e si
        avvicina a quello della squadra man mano che la stagione avanza: a una gara giocata la
        squadra pesa per un quinto, a dieci per il 71%. Senza questa cautela un solo risultato
        fuori scala verrebbe scambiato per una forza.
      </p>
      <p className="dossier-src">
        <b>Il limite, dichiarato.</b> I gol delle due squadre sono trattati come indipendenti.
        È l&apos;approssimazione classica e regge sui totali, ma <b>sottostima i risultati
        bassi in parità</b> &mdash; lo 0-0 e l&apos;1-1 &mdash; perché nel gioco vero i due
        punteggi si influenzano. La probabilità del pareggio va letta come un minimo. È una
        lettura probabilistica, non un consiglio di giocata.
      </p>
    </section>
  );
}
