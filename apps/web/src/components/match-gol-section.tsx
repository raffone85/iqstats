// Sezione "Gol" del dossier: gol attesi delle due squadre e i mercati che ne discendono.
//
// Non calcola nulla: riceve dal server i mercati già prodotti. Riusa per intero le classi
// del pannello del motore — `engine-*` — così non nasce CSS nuovo e le due sezioni si
// leggono con lo stesso occhio.
//
// Ogni scala evidenzia la voce più probabile. È una lettura, non un consiglio di giocata:
// il limite del modello sta scritto in fondo alla sezione, non solo nel codice.
import { MatchCombinazione } from "./match-combinazione";

import type { GolDiGara } from "@/server/iqstats/expected-famiglie";
import type { MatchOdds } from "@/server/iqstats/odds";
import type { GolDellaGara } from "@/server/iqstats/projection-runtime";
import type { CellaMatrice, Intervallo } from "@/server/iqstats/projection/gol";
import { TETTO_VALORE, testoValore, valoreInGruppo } from "@/server/iqstats/projection/valore";

function valore(numero: number): string {
  return numero.toFixed(2).replace(".", ",");
}

function percento(quota: number): string {
  return String(Math.round(quota * 100)) + "%";
}

function prezzo(quota: number): string {
  return quota.toFixed(2).replace(".", ",");
}

/** Una gara, non «1 gare»: il campione si legge in italiano. */
function gare(quante: number, dove: string): string {
  return `${quante} ${quante === 1 ? "gara" : "gare"} ${dove}`;
}

interface Voce {
  readonly etichetta: string;
  readonly probabilita: number;
  /** La quota dell'esito, dove una delle due fonti la apre. */
  readonly quota?: number | null;
  readonly valore?: number | null;
}

type QuoteFastbet = NonNullable<GolDiGara["quote"]>;

/**
 * Il prezzo di un esito e il suo valore, da **una** fonte sola per gruppo.
 *
 * Prima la quota di consenso; dove il consenso non ha quell'esito, Fastbet. Il gruppo con
 * cui si toglie il margine viene dalla stessa fonte del prezzo: mescolare due banchi nella
 * stessa somma darebbe una probabilità che non è di nessuno dei due.
 */
function conPrezzo(
  etichetta: string,
  probabilita: number,
  consenso: { readonly quota: number | null; readonly gruppo: readonly (number | null)[] },
  fastbet: { readonly quota: number | null; readonly gruppo: readonly (number | null)[] },
  daFastbet: Set<string>,
  mercato: string,
  copertura = 1,
): Voce {
  const fonte = consenso.quota !== null ? consenso : fastbet;
  if (fonte === fastbet && fastbet.quota !== null) daFastbet.add(mercato);
  return {
    etichetta,
    probabilita,
    quota: fonte.quota,
    valore: valoreInGruppo(probabilita, fonte.quota, fonte.gruppo, copertura),
  };
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
          <span className="engine-step-prob">
            {percento(voce.probabilita)}
            {voce.quota == null ? null : <i className="engine-prezzo">{prezzo(voce.quota)}</i>}
          </span>
          {voce.valore == null ? null : (
            <span className={voce.valore > 0 && voce.valore <= TETTO_VALORE ? "engine-valore is-valore" : "engine-valore"}>
              {testoValore(voce.valore)}
            </span>
          )}
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

/**
 * I multigol: la quota di consenso non li copre, quindi il prezzo è di Fastbet. Un
 * intervallo non ha un lato opposto, e il valore si legge sulla quota grezza, prudente.
 */
function daIntervalli(
  intervalli: readonly Intervallo[],
  quotati: QuoteFastbet["multigolPartita"] | undefined,
  daFastbet: Set<string>,
): Voce[] {
  return intervalli.map((i) => {
    const quota = quotati?.find((q) => q.da === i.da && q.a === i.a)?.quota ?? null;
    if (quota !== null) daFastbet.add("multigol");
    return {
      etichetta: `${i.da}-${i.a}`,
      probabilita: i.probabilita,
      quota,
      valore: valoreInGruppo(i.probabilita, quota, [quota]),
    };
  });
}

const ESITI: ReadonlyArray<{ chiave: CellaMatrice["esito"]; nome: string }> = [
  { chiave: "uno", nome: "1" },
  { chiave: "x", nome: "X" },
  { chiave: "due", nome: "2" },
];

/**
 * Esito e linea insieme.
 *
 * **Nessuna cella e' il prodotto di due probabilita'.** Ogni numero e' la somma delle
 * caselle della griglia dei punteggi che soddisfano tutte e due le condizioni; accanto sta
 * di quanto quel numero si discosta dalla moltiplicazione, che e' il modo in cui le due
 * letture verrebbero messe insieme se fossero indipendenti. Non lo sono, e la tabella lo
 * mostra cella per cella invece di dirlo in una nota.
 */
/** «Over 1,5», come la scala qui sopra: la linea non ha due decimali. */
function linea(valore: number): string {
  return `Over ${String(valore).replace(".", ",")}`;
}

function Matrice({
  celle,
  homeTeam,
  awayTeam,
}: {
  readonly celle: readonly CellaMatrice[];
  readonly homeTeam: string;
  readonly awayTeam: string;
}) {
  const linee = [...new Set(celle.map((cella) => cella.linea))].sort((a, b) => a - b);
  const nome = (chiave: CellaMatrice["esito"]): string =>
    chiave === "uno" ? `1 · ${homeTeam}` : chiave === "due" ? `2 · ${awayTeam}` : "X · pareggio";

  return (
    <div className="ref-table-wrap">
      <table className="ref-table">
        <thead>
          <tr>
            <th scope="col">Esito</th>
            {linee.map((soglia) => (
              <th scope="col" key={soglia}>
                {linea(soglia)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ESITI.map((esito) => (
            <tr key={esito.chiave}>
              <th scope="row">{nome(esito.chiave)}</th>
              {linee.map((soglia) => {
                const cella = celle.find(
                  (c) => c.esito === esito.chiave && c.linea === soglia,
                );
                if (cella === undefined) {
                  return <td key={soglia} data-label={linea(soglia)}>n/d</td>;
                }
                const punti = (cella.congiunta - cella.prodotto) * 100;
                const verso = punti >= 0 ? "is-sopra" : "is-sotto";
                return (
                  // `data-label` non e' decorazione: sotto i 760 px la tabella diventa una
                  // scheda per riga e il `thead` esce di scena, quindi senza etichetta il
                  // numero resterebbe senza la sua linea. Misurato guardando la cattura.
                  <td key={soglia} data-label={linea(soglia)}>
                    <b className="matrice-quota">{percento(cella.congiunta)}</b>
                    <span className={`matrice-scarto ${verso}`}>
                      {punti >= 0 ? "+" : "−"}
                      {valore(Math.abs(punti))} sul prodotto
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Props = {
  readonly gol: GolDellaGara;
  readonly homeTeam: string;
  readonly awayTeam: string;
  /**
   * Il calcio d'inizio dell'ultima gara che entra in questi conti.
   *
   * E' la copertura **di queste due squadre**, non del livello dati: le competizioni non
   * arrivano tutte allo stesso giorno, quindi una data unica sarebbe vera come massimo e
   * falsa come copertura di questa gara.
   */
  readonly ultima: string | null;
  /** La quota di consenso della gara, `null` dove la fonte non ne ha. */
  readonly odds: MatchOdds | null;
  /** I prezzi di Fastbet sui gol, per quello che il consenso non copre. */
  readonly fastbet: QuoteFastbet | null;
  readonly fastbetIl: string | null;
};

const GIORNO: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome",
};

function giorno(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "data non disponibile"
    : data.toLocaleDateString("it-IT", GIORNO);
}

export function MatchGolSection({ gol, homeTeam, awayTeam, ultima, odds, fastbet, fastbetIl }: Props) {
  const m = gol.mercati;
  const esatti = (quali: readonly number[]): Voce[] =>
    quali.map((probabilita, gol) => ({ etichetta: `${gol}`, probabilita }));

  const daFastbet = new Set<string>();
  const consenso = (mercato: string, chiavi: readonly string[], chiave: string) => {
    const esiti = odds?.markets[mercato];
    const quota = (k: string) => esiti?.find((o) => o.key === k)?.consensusOdds ?? null;
    return { quota: quota(chiave), gruppo: chiavi.map(quota) };
  };
  const banco = (quote: readonly (number | null)[], i: number) => ({ quota: quote[i], gruppo: quote });

  const esitoFb = [fastbet?.esito?.uno ?? null, fastbet?.esito?.x ?? null, fastbet?.esito?.due ?? null];
  const esito: Voce[] = ([["1", m.esito.uno, "HOME"], ["X", m.esito.x, "DRAW"], ["2", m.esito.due, "AWAY"]] as const)
    .map(([etichetta, p, chiave], i) => conPrezzo(
      etichetta, p, consenso("1x2", ["HOME", "DRAW", "AWAY"], chiave), banco(esitoFb, i), daFastbet, "esito",
    ));

  const over: Voce[] = m.overUnder.map((linea) => {
    const soglia = String(linea.linea);
    const fb = (verso: string) =>
      fastbet?.overUnder.find((q) => q.soglia === linea.linea && q.verso === verso)?.quota ?? null;
    return conPrezzo(
      `Over ${soglia.replace(".", ",")}`, linea.sopra,
      consenso(`over_under_${soglia.replace(".", "")}`, [`over@${soglia}`, `under@${soglia}`], `over@${soglia}`),
      banco([fb("Over"), fb("Under")], 0), daFastbet, "gol totali",
    );
  });

  const ggFb = [fastbet?.gol ?? null, fastbet?.noGol ?? null];
  const entrambe: Voce[] = [
    conPrezzo("Sì", m.gg, consenso("btts", ["yes", "no"], "yes"), banco(ggFb, 0), daFastbet, "gol/nogol"),
    conPrezzo("No", m.ng, consenso("btts", ["yes", "no"], "no"), banco(ggFb, 1), daFastbet, "gol/nogol"),
  ];

  // Ogni risultato cade in due doppie chance su tre: le probabilità sommano a due, e il
  // margine si toglie riportando a due la somma delle inverse.
  const dcFb = [fastbet?.doppiaChance?.unoX ?? null, fastbet?.doppiaChance?.xDue ?? null, fastbet?.doppiaChance?.unoDue ?? null];
  const doppia: Voce[] = ([["1X", m.doppiaChance.unoX], ["X2", m.doppiaChance.xDue], ["12", m.doppiaChance.unoDue]] as const)
    .map(([etichetta, p], i) => conPrezzo(
      etichetta, p, consenso("double_chance", ["1X", "X2", "12"], etichetta), banco(dcFb, i), daFastbet,
      "doppia chance", 2,
    ));

  const multiPartita = daIntervalli(m.multigolPartita, fastbet?.multigolPartita, daFastbet);
  const multiCasa = daIntervalli(m.casa.multigol, fastbet?.multigolCasa, daFastbet);
  const multiTrasferta = daIntervalli(m.trasferta.multigol, fastbet?.multigolTrasferta, daFastbet);
  const conQuota = [...esito, ...over, ...entrambe, ...doppia, ...multiPartita, ...multiCasa, ...multiTrasferta]
    .some((v) => v.quota != null);

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
              <span className="engine-exp">{valore(m.casa.attesi)}</span>
              <span className="engine-dettaglio">
                fra {m.casa.minimo} e {m.casa.massimo} gol · {gare(gol.campioneCasa, "in casa")}
              </span>
            </li>
            <li className="engine-split">
              <span className="engine-who">{awayTeam}</span>
              <span className="engine-exp">{valore(m.trasferta.attesi)}</span>
              <span className="engine-dettaglio">
                fra {m.trasferta.minimo} e {m.trasferta.massimo} gol ·{" "}
                {gare(gol.campioneTrasferta, "fuori casa")}
              </span>
            </li>
            <li className="engine-split">
              <span className="engine-who">Totale gara</span>
              <span className="engine-exp">{valore(m.attesiTotali)}</span>
              <span className="engine-dettaglio">
                fra {m.totaliMinimo} e {m.totaliMassimo} gol
              </span>
            </li>
          </ul>
        </Riga>
        <Riga titolo="Esito finale">
          <Scala titolo="Probabilità dei tre esiti" voci={esito} />
        </Riga>
        <Riga titolo="Gol totali, sopra la linea">
          <Scala titolo="Probabilità di superare ciascuna linea" voci={over} />
        </Riga>
        <Riga titolo="Entrambe le squadre segnano">
          <Scala titolo="Probabilità che segnino entrambe" voci={entrambe} />
        </Riga>
      </ul>

      {/* Da dove viene il prezzo, detto una volta per la sezione: il consenso prima, Fastbet
          solo per i mercati che il consenso non apre. Senza prezzi lo si dice, senza zeri. */}
      <p className="engine-obs">
        {!conQuota ? (
          <>Su questa gara nessuna fonte quota i mercati dei gol: le percentuali restano senza prezzo.</>
        ) : (
          <>
            Accanto alle percentuali, dove esiste, la quota di consenso
            {odds === null ? null : <> su {odds.bookmakers} operatori</>}
            {daFastbet.size === 0 ? null : (
              <>
                ; per {[...daFastbet].join(", ")} la quota di Fastbet
                {fastbetIl === null ? null : <> raccolta il {giorno(fastbetIl)}</>}
              </>
            )}
            . Il valore dice di quanti punti la nostra probabilità supera quella del prezzo, al
            netto del margine dove il mercato è completo: non dice che l&apos;esito accadrà.
          </>
        )}
      </p>

      {/* **I quattro mercati derivati si aprono.** Doppia chance, gol esatti, risultati e
          multigol escono dalla stessa distribuzione dei quattro sopra: non sono
          informazione nuova, sono la stessa informazione tagliata in altri modi. Chi li
          vuole li apre; chi cerca quanti gol si ferma prima. */}
      <details className="gol-derivati">
        <summary>Doppia chance, gol esatti, risultati, esito con la linea e multigol</summary>
        <ul className="engine-rows">
        <Riga titolo="Doppia chance">
          <Scala titolo="Probabilità delle doppie chance" voci={doppia} />
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
        <Riga titolo="Esito e linea insieme">
          <Matrice celle={m.matrice} homeTeam={homeTeam} awayTeam={awayTeam} />
          <p className="dossier-src">
            Ogni casella è la probabilità che le <b>due cose accadano nella stessa gara</b>,
            sommata sulla griglia dei punteggi. Accanto sta di quanto si discosta dal
            prodotto delle due probabilità separate: le due letture <b>non sono
            indipendenti</b>, e moltiplicarle sbaglierebbe di quel tanto. Il caso più
            grosso è il pareggio con molti gol, che ha bisogno di un 2-2 o di un 3-3.
          </p>
        </Riga>
        <Riga titolo="Multigol">
          <ul className="engine-splits">
            <li className="engine-split">
              <span className="engine-who">Totale gara</span>
              <span className="engine-exp" aria-hidden="true" />
              <Scala titolo="Multigol di partita" voci={multiPartita} />
            </li>
            <li className="engine-split">
              <span className="engine-who">{homeTeam}</span>
              <span className="engine-exp" aria-hidden="true" />
              <Scala titolo={`Multigol di ${homeTeam}`} voci={multiCasa} />
            </li>
            <li className="engine-split">
              <span className="engine-who">{awayTeam}</span>
              <span className="engine-exp" aria-hidden="true" />
              <Scala titolo={`Multigol di ${awayTeam}`} voci={multiTrasferta} />
            </li>
          </ul>
        </Riga>
        </ul>
      </details>

      <details className="gol-derivati">
        <summary>Più letture di questa gara, insieme</summary>
        <MatchCombinazione
          attesiCasa={m.casa.attesi}
          attesiTrasferta={m.trasferta.attesi}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
        />
        <p className="dossier-src">
          I sette bersagli del motore &mdash; tiri, corner, falli, cartellini &mdash;{" "}
          <b>non entrano qui</b>, e non è una dimenticanza: nella stessa gara sono legati fra
          loro, misurato su 11.066 gare (tiri e tiri in porta 0,622, tiri e parate 0,556,
          falli e gialli 0,413), e la loro probabilità congiunta non è modellata. Senza
          quella, un numero composto sarebbe inventato.
        </p>
      </details>

      {/* Le due note che spiegano **come** nasce il numero si aprono: sono uguali su ogni
          gara, e chi le ha lette una volta non le rilegge. Il limite invece resta in
          pagina: una lettura che sottostima i pareggi bassi deve dirlo, non nasconderlo. */}
      <details className="dossier-spiega">
        <summary>Come nascono questi numeri</summary>
      <p className="dossier-src">
        I gol attesi nascono dai <b>gol attesi osservati</b> nelle gare già giocate in questa
        stagione: quanto ciascuna squadra ne produce dal suo lato del campo, per quanto
        l&apos;avversaria ne concede dal proprio, misurati contro la media della competizione
        &mdash; {gol.campioneLega} righe di lega, {gare(gol.campioneCasa, "in casa")} e{" "}
        {gol.campioneTrasferta} fuori. Il vantaggio del campo non è un coefficiente aggiunto a
        mano: sta nelle due medie di lega, che sono diverse perché misurate sui due lati.{" "}
        La storia di queste due squadre arriva{" "}
        {ultima === null ? "a una data non disponibile" : `al ${giorno(ultima)}`}.
      </p>
      <p className="dossier-src">
        <b>Con poche gare il numero resta vicino alla media della competizione</b>, e si
        avvicina a quello della squadra man mano che la stagione avanza: a una gara giocata la
        squadra pesa per un quinto, a dieci per il 71%. Senza questa cautela un solo risultato
        fuori scala verrebbe scambiato per una forza.
      </p>
      </details>

      <p className="dossier-src">
        <b>Il limite, dichiarato.</b> I due attacchi sono trattati come indipendenti: regge
        sui totali, ma <b>sottostima i pareggi bassi</b>, lo 0-0 e l&apos;1-1. La probabilità
        del pareggio va letta come un minimo.
      </p>
    </section>
  );
}
