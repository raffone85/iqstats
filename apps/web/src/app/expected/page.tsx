// Expected: una pagina per accoppiamento, piu' un indice per arrivarci.
//
// **Una sola rotta, due pagine.** `/expected` e' l'indice delle gare in arrivo;
// `/expected?league=…&home=…&away=…&fixtureId=…&date=…` e' la gara. Decide `fixtureId`: gli
// altri parametri sono etichette leggibili nell'indirizzo e non scelgono niente, perche'
// due squadre non identificano una gara e una data invecchia.
//
// **L'indice e' magro, la gara e' densa.** Prima le righe si aprivano dentro l'elenco e la
// gara non aveva un indirizzo suo: ventiquattro gare aperte facevano 29.986 px a 375. Ora
// l'elenco dice **quale gara vale la pena aprire** - le due squadre, l'ora, il consigliato -
// e la gara dice **perche'**.
//
// **Le sette famiglie stanno tutte aperte, in riga.** Nel dossier quattro sono aperte e tre
// chiuse dietro un dettaglio, ed e' la ragione per cui l'11 settembre 2026 i cartellini di
// Sevilla-Valencia - la famiglia **piu' probabile** della gara, 80,8% - non si vedevano.
// Qui non c'e' un capitolo da accorciare: la pagina e' le famiglie.
//
// **La motivazione non e' prosa, sono i numeri del motore.** Per ogni famiglia: che cosa
// attende il motore e dentro quale intervallo, perche' si accende **quella** soglia, quanto
// succede in quel campionato e su quante gare, di quanto ce ne stacchiamo, e che cosa ha
// mosso l'atteso in **questa** gara. Le cause arrivano dai contributi esatti delle feature
// - i modelli sono lineari - raggruppati da `causeDellaLettura`.
//
// **Il consigliato non e' scelto qui.** Lo sceglie `ordinaLetture`, il criterio di cui il
// consuntivo di `/metodo` conosce la resa, con la soglia di scarto decisa il 10 settembre
// 2026. Questa pagina lo mostra e lo motiva, non lo sceglie.
import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";
import { TeamCrest } from "@/components/team-crest";
import { FAMIGLIE } from "@/components/match-projection-section";
import { resaDelBersaglio, GARE_DEL_CONSUNTIVO } from "@/server/iqstats/consuntivo";
import {
  expectedDelleGare,
  type GaraExpected,
  type AttesiDiFamiglia,
  type IntervalloDiGol,
  type RigaDiFamiglia,
  type RigaQuotata,
} from "@/server/iqstats/expected-famiglie";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  title: "Expected",
  description:
    "Le gare in arrivo con i numeri del motore: tiri, tiri in porta, falli, cartellini, "
    + "corner, fuorigioco e parate con le loro soglie, e il pronostico consigliato.",
};

const QUANDO: Intl.DateTimeFormatOptions = {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Rome",
};

/** Dentro un giorno la data e' gia' scritta nella testata: resta l'ora. */
const ORA: Intl.DateTimeFormatOptions = {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
};

/**
 * Il giorno di Roma di un istante, come `2026-09-11`.
 *
 * `en-CA` da' l'ordine anno-mese-giorno, che si confronta come stringa: due gare dello
 * stesso giorno danno la stessa chiave senza passare da una data locale del server, che
 * su un fuso diverso spezzerebbe la sera in due giorni.
 */
const GIORNO = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Rome",
});

const TESTATA: Intl.DateTimeFormatOptions = {
  weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome",
};

function ora(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "orario non disponibile" : data.toLocaleString("it-IT", ORA);
}

function quando(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? "orario non disponibile"
    : data.toLocaleString("it-IT", QUANDO);
}

/** La virgola al posto del punto: e' la voce italiana delle soglie. */
function soglia(valore: number): string {
  return String(valore).replace(".", ",");
}

function virgola(valore: number): string {
  return valore.toFixed(1).replace(".", ",");
}

function nomeFamiglia(bersaglio: string): string {
  return FAMIGLIE[bersaglio]?.nome ?? bersaglio;
}

function chiRiguarda(lato: RigaDiFamiglia["lato"], casa: string, fuori: string): string {
  return lato === "casa" ? casa : lato === "trasferta" ? fuori : "Totale gara";
}

/** La linea come si legge: «Over 2,5 fuorigioco». */
function linea(r: RigaDiFamiglia): string {
  return `${r.verso} ${soglia(r.soglia)} ${nomeFamiglia(r.bersaglio)}`;
}

/** Lo scarto fra quanto diciamo noi e quanto succede in quel campionato, in punti. */
function scartoDi(r: RigaDiFamiglia): number | null {
  return r.base === null ? null : Number((r.probabilita * 100 - r.base).toFixed(1));
}

/** Il primo parametro, quando la stessa chiave arriva ripetuta. */
function unoSolo(valore: string | string[] | undefined): string | null {
  if (Array.isArray(valore)) return valore[0] ?? null;
  return valore ?? null;
}

/**
 * L'indirizzo della gara: `fixtureId` decide, il resto si legge.
 *
 * I nomi delle squadre e la data non entrano in nessuna ricerca — sono etichette, e una
 * gara resta la stessa anche se il nome cambia — ma un indirizzo che dice chi gioca si
 * condivide, e uno che dice solo un numero no.
 */
function indirizzoDi(g: GaraExpected): string {
  const q = new URLSearchParams();
  if (g.lega !== null) q.set("league", g.lega);
  q.set("home", g.casa);
  q.set("away", g.fuori);
  q.set("fixtureId", String(g.gara));
  q.set("date", g.kickoff.slice(0, 10));
  return `/expected?${q.toString()}`;
}

/**
 * La motivazione di una riga: solo i numeri che cambiano da riga a riga.
 *
 * **La regola non si ripete sette volte.** La prima resa diceva per ogni famiglia «fra le
 * tre soglie vicine a quel valore… è quella su cui il verso è più deciso» e «con il 75% del
 * numero che viene dal modello e il resto dalla media del campionato»: misurato l'11
 * settembre 2026, otto ripetizioni a testa, 733 parole su 122 numeri, **6,0 parole per
 * numero** — il rapporto che questa pagina esiste per rompere. Il metodo sta scritto una
 * volta sola, in fondo; qui restano i numeri di questa riga.
 */
function Motivazione({ r }: { readonly r: RigaDiFamiglia }) {
  const scarto = scartoDi(r);
  return (
    <p className="expected-perche">
      <span className="expected-dato">
        attesi <b>{virgola(r.atteso)}</b>
        {r.intervallo === null
          ? ""
          : ` fra ${Math.round(r.intervallo.basso)} e ${Math.round(r.intervallo.alto)}`}
      </span>
      {r.base === null || scarto === null ? (
        <span className="expected-dato">campionato non noto</span>
      ) : (
        <>
          <span className="expected-dato">
            campionato {Math.round(r.base)}%
            {r.gareDiBase === null ? "" : ` su ${r.gareDiBase}`}
          </span>
          <span className="expected-dato">
            <b className={scarto > 0 ? "is-sopra" : "is-sotto"}>
              {scarto > 0 ? "+" : "−"}{virgola(Math.abs(scarto))} punti
            </b>
            {scarto > 0 ? "" : " · non è notizia"}
          </span>
        </>
      )}
      {r.origine === "miscela" ? (
        <span className="expected-dato">{Math.round(r.pesoDelModello * 100)}% modello</span>
      ) : null}
      {r.cause.length === 0 ? null : (
        <span className="expected-cause">
          {r.cause.map((c) => (
            <span key={c.nome} className="expected-dato">
              <b className={c.effetto > 0 ? "is-sopra" : "is-sotto"}>
                {c.effetto > 0 ? "+" : "−"}{Math.abs(Math.round(c.effetto * 100))}%
              </b>{" "}
              {c.nome}
            </span>
          ))}
        </span>
      )}
    </p>
  );
}

/**
 * Il metodo, una volta per pagina.
 *
 * Sono le quattro frasi che prima stavano dentro ogni riga: come nasce la soglia, che cosa
 * misura lo scarto, che cosa vuol dire la quota di modello, che cosa sono le cause. Uguali
 * su ogni gara, quindi scritte una volta e chiuse: chi le ha lette non le rilegge.
 */
function ComeSiLegge() {
  return (
    <details className="dossier-spiega expected-metodo">
      <summary>Come si legge questa pagina</summary>
      <p className="dossier-src">
        <b>La soglia non si sceglie a gusto.</b> Il motore costruisce cinque soglie attorno
        al valore atteso arrotondato, scarta le due agli estremi — là un numero alto viene
        dalla distanza e non da un&apos;informazione — e fra le tre che restano accende
        quella su cui il verso è più deciso.
      </p>
      <p className="dossier-src">
        <b>Lo scarto è il metro.</b> È la distanza fra la nostra probabilità e quanto quella
        linea succede davvero in quel campionato, sul campione dichiarato. Dove non è
        positivo la lettura promette meno del caso base: è vera e non aggiunge niente, e
        sta scritto.
      </p>
      <p className="dossier-src">
        <b>«75% modello» non è un dettaglio.</b> Con poche gare giocate il valore atteso è
        una miscela fra il modello e la media del campionato, e quella quota dice quanta
        parte del numero viene dal modello. Il resto è la norma del torneo: finché le gare
        sono poche il numero le resta vicino, per costruzione.
      </p>
      <p className="dossier-src">
        <b>Le cause sono esatte, non stimate.</b> I modelli sono lineari, quindi il
        contributo di ogni feature al numero si calcola: `coefficiente × valore
        standardizzato`. Qui sono raggruppate per famiglia e convertite in quota
        dell&apos;atteso, e restano fuori le feature che contano gare invece che calcio —
        quante partite abbiamo visto misura la nostra ignoranza, non questa gara. Spiegano
        la quota del modello, non tutto il numero.
      </p>
    </details>
  );
}

/** Una famiglia: la linea, la probabilità, e la motivazione che la regge. */
function Famiglia({ r, casa, fuori }: {
  readonly r: RigaDiFamiglia;
  readonly casa: string;
  readonly fuori: string;
}) {
  return (
    <li className="expected-famiglia">
      <span className="expected-riga">
        <span className="expected-riga-linea">
          {linea(r)}
          <span className="engine-obs">{chiRiguarda(r.lato, casa, fuori)}</span>
        </span>
        <span className="expected-riga-valore">
          <b>{Math.round(r.probabilita * 100)}%</b>
          <i>affidabilità {r.affidabilita}</i>
        </span>
      </span>
      <Motivazione r={r} />
    </li>
  );
}

/** La quota come si scrive in Italia: due decimali e la virgola. */
function prezzo(quota: number): string {
  return quota.toFixed(2).replace(".", ",");
}

/** La nostra probabilita' accanto a una quota, o un trattino quando non ce n'e' una. */
function nostra(probabilita: number | null): string {
  return probabilita === null ? "—" : `${Math.round(probabilita * 100)}%`;
}

/**
 * Una riga del mercato: la linea, il prezzo del banco, la nostra probabilita'.
 *
 * L'ordine delle tre colonne non e' neutro. La linea dice **di che cosa si parla**, la
 * quota e' il dato che il banco espone e il nostro numero sta in fondo, dove si legge per
 * ultimo: e' l'unico dei tre che abbiamo calcolato noi, e va confrontato con gli altri due,
 * non letto da solo.
 */
function RigaDiMercato({ r }: { readonly r: RigaQuotata }) {
  return (
    <li className="quota-riga">
      <span className="quota-linea">
        {r.verso} {soglia(r.soglia)}
        {r.fuoriFinestra ? <em title="soglia fuori dalle cinque misurate">fuori misura</em> : null}
      </span>
      <b className="quota-prezzo">{prezzo(r.quota)}</b>
      <span className="quota-nostra">{nostra(r.probabilita)}</span>
    </li>
  );
}

/**
 * Le linee di una famiglia, divise per lato, con l'atteso di ciascun lato in testa.
 *
 * **Quando manca il nostro numero si dice perche'.** Il banco quota anche i bersagli che
 * dipendono dall'arbitro, e finche' la designazione non c'e' quelle scale ripiegano: il
 * motore non pubblica una probabilita' e la colonna resta vuota. Misurato l'11 settembre
 * 2026: **429 righe su 3.870**, l'11,1%. Una colonna di trattini senza una riga che ne
 * dica la ragione si legge come un guasto nostro.
 */
function MercatoDiFamiglia({ bersaglio, righe, casa, fuori, senzaArbitro }: {
  readonly bersaglio: string;
  readonly righe: readonly RigaQuotata[];
  readonly casa: string;
  readonly fuori: string;
  readonly senzaArbitro: boolean;
}) {
  const lati: ReadonlyArray<RigaQuotata["lato"]> = ["casa", "trasferta", "totale"];
  const mute = righe.every((r) => r.probabilita === null);
  return (
    <details className="quota-famiglia" open>
      <summary>{nomeFamiglia(bersaglio)}</summary>
      {mute ? (
        <p className="quota-assenza">
          {senzaArbitro
            ? "L'arbitro non è ancora designato, e questa famiglia dipende da lui: restano le quote del banco, senza una nostra probabilità accanto."
            : "Su questa scala il motore ripiega su una media, e sotto un ripiego non pubblica una probabilità: restano le quote del banco."}
        </p>
      ) : null}
      {lati.map((lato) => {
        const diLato = righe.filter((r) => r.lato === lato);
        if (diLato.length === 0) return null;
        return (
          <div key={lato} className="quota-lato">
            <p className="quota-lato-titolo">
              {chiRiguarda(lato, casa, fuori)}
              <i>atteso {virgola(diLato[0].atteso)}</i>
            </p>
            <ul className="quota-righe">
              {diLato.map((r) => (
                <RigaDiMercato key={`${r.verso}-${r.soglia}`} r={r} />
              ))}
            </ul>
          </div>
        );
      })}
    </details>
  );
}

/** Una riga dei mercati sui gol, che non hanno una soglia ma un nome. */
function RigaDiGol({ nome, quota, probabilita }: {
  readonly nome: string;
  readonly quota: number | null;
  readonly probabilita: number | null;
}) {
  if (quota === null) return null;
  return (
    <li className="quota-riga">
      <span className="quota-linea">{nome}</span>
      <b className="quota-prezzo">{prezzo(quota)}</b>
      <span className="quota-nostra">{nostra(probabilita)}</span>
    </li>
  );
}

/** La probabilita' nostra di un intervallo di gol, `null` se non l'abbiamo su quello. */
function nostroIntervallo(
  nostri: readonly IntervalloDiGol[],
  da: number,
  a: number,
): number | null {
  return nostri.find((v) => v.da === da && v.a === a)?.probabilita ?? null;
}

/**
 * I mercati sui gol: gli unici che il banco quota su tutte le gare.
 *
 * Sono l'altra meta' della domanda. Le sette famiglie dicono come si giochera' la partita;
 * qui c'e' il risultato, che e' la cosa su cui il banco ha il prezzo piu' curato di tutti.
 */
function MercatoDeiGol({ g, casa, fuori }: {
  readonly g: NonNullable<GaraExpected["gol"]>;
  readonly casa: string;
  readonly fuori: string;
}) {
  const { nostri, quote } = g;
  if (quote === null) return null;
  const multigol: ReadonlyArray<{
    readonly titolo: string;
    readonly loro: readonly IntervalloDiGol[];
    readonly nostro: readonly IntervalloDiGol[];
  }> = [
    { titolo: "Multigol partita", loro: quote.multigolPartita, nostro: nostri.multigolPartita },
    { titolo: `Multigol ${casa}`, loro: quote.multigolCasa, nostro: nostri.multigolCasa },
    { titolo: `Multigol ${fuori}`, loro: quote.multigolTrasferta, nostro: nostri.multigolTrasferta },
  ];

  return (
    <details className="quota-famiglia" open>
      <summary>Gol</summary>
      {quote.esito === null ? null : (
        <div className="quota-lato">
          <p className="quota-lato-titolo">
            Esito<i>attesi {virgola(nostri.attesiCasa)} - {virgola(nostri.attesiTrasferta)}</i>
          </p>
          <ul className="quota-righe">
            <RigaDiGol nome={`1 ${casa}`} quota={quote.esito.uno} probabilita={nostri.esito.uno} />
            <RigaDiGol nome="X pareggio" quota={quote.esito.x} probabilita={nostri.esito.x} />
            <RigaDiGol nome={`2 ${fuori}`} quota={quote.esito.due} probabilita={nostri.esito.due} />
            {quote.doppiaChance === null ? null : (
              <>
                <RigaDiGol
                  nome="1X" quota={quote.doppiaChance.unoX}
                  probabilita={nostri.doppiaChance.unoX}
                />
                <RigaDiGol
                  nome="12" quota={quote.doppiaChance.unoDue}
                  probabilita={nostri.doppiaChance.unoDue}
                />
                <RigaDiGol
                  nome="X2" quota={quote.doppiaChance.xDue}
                  probabilita={nostri.doppiaChance.xDue}
                />
              </>
            )}
            <RigaDiGol nome="Gol" quota={quote.gol} probabilita={nostri.gg} />
            <RigaDiGol nome="No gol" quota={quote.noGol} probabilita={nostri.ng} />
          </ul>
        </div>
      )}

      {quote.overUnder.length === 0 ? null : (
        <div className="quota-lato">
          <p className="quota-lato-titolo">
            Gol totali<i>attesi {virgola(nostri.attesiCasa + nostri.attesiTrasferta)}</i>
          </p>
          <ul className="quota-righe">
            {quote.overUnder.map((q) => {
              const linea = nostri.overUnder.find((l) => l.linea === q.soglia);
              const p = linea === undefined
                ? null
                : q.verso === "Over" ? linea.sopra : linea.sotto;
              return (
                <RigaDiGol
                  key={`${q.verso}-${q.soglia}`}
                  nome={`${q.verso} ${soglia(q.soglia)}`}
                  quota={q.quota}
                  probabilita={p}
                />
              );
            })}
          </ul>
        </div>
      )}

      {multigol.map((m) => (m.loro.length === 0 ? null : (
        <div key={m.titolo} className="quota-lato">
          <p className="quota-lato-titolo">{m.titolo}</p>
          <ul className="quota-righe">
            {m.loro.map((q) => (
              <RigaDiGol
                key={`${q.da}-${q.a}`}
                nome={`${q.da}-${q.a}`}
                quota={q.quota ?? null}
                probabilita={nostroIntervallo(m.nostro, q.da, q.a)}
              />
            ))}
          </ul>
        </div>
      )))}
    </details>
  );
}

/**
 * Il mercato della gara: ogni linea che il banco quota, con il nostro numero accanto.
 *
 * **Il verso e' l'opposto delle famiglie qui sopra.** La', il motore sceglie la soglia dal
 * proprio atteso e mostra la lettura piu' decisa; qui le soglie le detta il bookmaker e noi
 * calcoliamo la probabilita' su ognuna, dalla stessa distribuzione calibrata. La quota non
 * entra nel nostro numero: se ci entrasse, il confronto sarebbe il banco contro se stesso.
 */
function Mercato({ g, raccolteIl }: {
  readonly g: GaraExpected;
  readonly raccolteIl: string | null;
}) {
  if (g.quote.length === 0 && g.gol?.quote == null) return null;

  const perFamiglia = new Map<string, RigaQuotata[]>();
  for (const r of g.quote) {
    const gia = perFamiglia.get(r.bersaglio);
    if (gia === undefined) perFamiglia.set(r.bersaglio, [r]);
    else gia.push(r);
  }

  return (
    <section className="expected-mercato" aria-labelledby="expected-mercato-title">
      <p className="eyebrow" id="expected-mercato-title">Le quote di Fastbet</p>
      <p className="expected-perche expected-mercato-nota">
        <span className="expected-dato">linea del banco</span>
        <span className="expected-dato">quota</span>
        <span className="expected-dato">nostra probabilità</span>
        {raccolteIl === null
          ? null
          : <span className="expected-dato">raccolte il {quando(raccolteIl)}</span>}
      </p>
      {g.gol === null ? null : <MercatoDeiGol g={g.gol} casa={g.casa} fuori={g.fuori} />}
      {[...perFamiglia.entries()].map(([bersaglio, righe]) => (
        <MercatoDiFamiglia
          key={bersaglio}
          bersaglio={bersaglio}
          righe={righe}
          casa={g.casa}
          fuori={g.fuori}
          senzaArbitro={g.senzaMisura.includes(bersaglio)}
        />
      ))}
    </section>
  );
}

/** L'atteso di una famiglia su un lato, `null` se quella scala non esce. */
function attesoDi(
  attesi: readonly AttesiDiFamiglia[],
  bersaglio: string,
  lato: "casa" | "trasferta" | "totale",
): number | null {
  return attesi.find((a) => a.bersaglio === bersaglio)?.[lato] ?? null;
}

/**
 * La linea quotata piu' vicina all'atteso, fra quelle di quel bersaglio e di quel lato.
 *
 * **La piu' vicina, non la piu' alta.** Una riga di riepilogo che scegliesse la probabilita'
 * piu' grande direbbe ogni volta la cosa scontata - «Over 0,5 corner al 99%» - che e' la
 * stessa ragione per cui il consigliato passa dallo scarto e non dalla probabilita' nuda.
 */
function lineaVicina(
  quote: readonly RigaQuotata[],
  bersaglio: string,
  lato: "casa" | "trasferta" | "totale",
): RigaQuotata | null {
  let vicina: RigaQuotata | null = null;
  for (const r of quote) {
    if (r.bersaglio !== bersaglio || r.lato !== lato || r.verso !== "Over") continue;
    if (r.probabilita === null) continue;
    if (vicina === null || Math.abs(r.soglia - r.atteso) < Math.abs(vicina.soglia - vicina.atteso)) {
      vicina = r;
    }
  }
  return vicina;
}

/** «Over 9,5 al 47%, quota 2,05», oppure la sola probabilita' se il banco non la quota. */
function DettoCosi({ r }: { readonly r: RigaQuotata | null }) {
  if (r === null || r.probabilita === null) return null;
  return (
    <>
      {" "}{r.verso} {soglia(r.soglia)} al <b>{Math.round(r.probabilita * 100)}%</b>,
      quota {prezzo(r.quota)}.
    </>
  );
}

/**
 * Il riepilogo della gara: i numeri gia' mostrati sopra, detti in ordine di lettura.
 *
 * **Non e' un pronostico e non ne aggiunge uno.** Il consigliato sta in cima e ha il suo
 * criterio, di cui il consuntivo conosce la resa; qui si riassume che partita il motore si
 * aspetta - quanti gol, quanti corner, quanta disciplina - senza ordinare le letture per
 * probabilita', che e' il modo piu' rapido per mettere in cima la cosa piu' ovvia.
 *
 * Ogni numero viene dall'artefatto: nessuna frase qui sotto esiste senza il suo dato.
 */
function Riepilogo({ g }: { readonly g: GaraExpected }) {
  const { attesi, quote, gol } = g;
  if (attesi.length === 0 && gol === null) return null;

  const corner = attesoDi(attesi, "corner_kicks", "totale");
  const falli = attesoDi(attesi, "fouls", "totale");
  const cartellini = attesoDi(attesi, "yellow_cards", "totale");
  const fuorigioco = attesoDi(attesi, "offsides", "totale");
  const tiri = attesoDi(attesi, "total_shots", "totale");
  const inPorta = attesoDi(attesi, "shots_on_target", "totale");
  const nostri = gol?.nostri ?? null;
  const quoteGol = gol?.quote ?? null;
  const due = nostri === null ? null : nostri.overUnder.find((l) => l.linea === 2.5) ?? null;
  const quotaDue = quoteGol?.overUnder.find((q) => q.soglia === 2.5 && q.verso === "Over") ?? null;
  const favorita = nostri === null
    ? null
    : nostri.esito.uno > nostri.esito.due ? g.casa : g.fuori;
  const forza = nostri === null ? 0 : Math.abs(nostri.esito.uno - nostri.esito.due);

  return (
    <section className="expected-riepilogo" aria-labelledby="expected-riepilogo-title">
      <p className="eyebrow" id="expected-riepilogo-title">In sintesi</p>
      <dl className="riepilogo-voci">
        {nostri === null || favorita === null ? null : (
          <div className="riepilogo-voce">
            <dt>Scenario</dt>
            <dd>
              {forza < 0.08 ? "Gara equilibrata" : `${favorita} favorita`}: vittoria{" "}
              {g.casa} al <b>{Math.round(nostri.esito.uno * 100)}%</b>, pareggio al{" "}
              <b>{Math.round(nostri.esito.x * 100)}%</b>, vittoria {g.fuori} al{" "}
              <b>{Math.round(nostri.esito.due * 100)}%</b>. Gol attesi{" "}
              {virgola(nostri.attesiCasa)} contro {virgola(nostri.attesiTrasferta)}.
            </dd>
          </div>
        )}
        {nostri === null || due === null ? null : (
          <div className="riepilogo-voce">
            <dt>Gol</dt>
            <dd>
              Il modello ne attende <b>{virgola(nostri.attesiCasa + nostri.attesiTrasferta)}</b>{" "}
              in tutto. Over 2,5 al <b>{Math.round(due.sopra * 100)}%</b>, Under 2,5 al{" "}
              <b>{Math.round(due.sotto * 100)}%</b>
              {quotaDue === null ? "." : `, e il banco paga l'Over ${prezzo(quotaDue.quota)}.`}
            </dd>
          </div>
        )}
        {nostri === null ? null : (
          <div className="riepilogo-voce">
            <dt>Entrambe segnano</dt>
            <dd>
              Gol al <b>{Math.round(nostri.gg * 100)}%</b>, No gol al{" "}
              <b>{Math.round(nostri.ng * 100)}%</b>
              {quoteGol?.gol == null ? "." : `, quota ${prezzo(quoteGol.gol)} e ${
                quoteGol.noGol === null ? "prezzo assente" : prezzo(quoteGol.noGol)}.`}
            </dd>
          </div>
        )}
        {corner === null ? null : (
          <div className="riepilogo-voce">
            <dt>Corner</dt>
            <dd>
              Attesi <b>{virgola(corner)}</b> in tutto
              {attesoDi(attesi, "corner_kicks", "casa") === null ? "" : ` (${
                virgola(attesoDi(attesi, "corner_kicks", "casa") ?? 0)} battuti da ${g.casa}, ${
                virgola(attesoDi(attesi, "corner_kicks", "trasferta") ?? 0)} da ${g.fuori})`}.
              <DettoCosi r={lineaVicina(quote, "corner_kicks", "totale")} />
            </dd>
          </div>
        )}
        {falli === null && cartellini === null ? null : (
          <div className="riepilogo-voce">
            <dt>Disciplina</dt>
            <dd>
              {falli === null ? "" : `Attesi ${virgola(falli)} falli`}
              {falli !== null && cartellini !== null ? " e " : ""}
              {cartellini === null ? "" : `${virgola(cartellini)} cartellini gialli`}.
              <DettoCosi r={lineaVicina(quote, "yellow_cards", "totale")} />
            </dd>
          </div>
        )}
        {tiri === null && inPorta === null ? null : (
          <div className="riepilogo-voce">
            <dt>Tiri</dt>
            <dd>
              {tiri === null ? "" : `Attesi ${virgola(tiri)} tiri`}
              {tiri !== null && inPorta !== null ? ", di cui " : ""}
              {inPorta === null ? "" : `${virgola(inPorta)} nello specchio`}.
              <DettoCosi r={lineaVicina(quote, "total_shots", "totale")} />
            </dd>
          </div>
        )}
        {fuorigioco === null ? null : (
          <div className="riepilogo-voce">
            <dt>Fuorigioco</dt>
            <dd>
              Attesi <b>{virgola(fuorigioco)}</b> in tutto.
              <DettoCosi r={lineaVicina(quote, "offsides", "totale")} />
            </dd>
          </div>
        )}
      </dl>
      {/* La resa vera al posto di un punteggio di fiducia: e' misurata, e sulle gare chiuse. */}
      <p className="engine-obs expected-riepilogo-nota">
        Quanto ha reso finora ciascuna di queste famiglie sta in{" "}
        <Link href="/metodo">metodo</Link>, sulle{" "}
        {GARE_DEL_CONSUNTIVO.toLocaleString("it-IT")} gare già chiuse. Le probabilità sono
        del nostro modello, le quote sono di Fastbet: nessuna delle due entra nel calcolo
        dell&apos;altra.
      </p>
    </section>
  );
}

/**
 * Le gare divise per giorno, nell'ordine in cui si giocano.
 *
 * **Oggi e domani si chiamano per nome**, il resto porta la sua data: «venerdi 11
 * settembre» dice meno di «Oggi» a chi sta guardando oggi. Il confronto passa dalla chiave
 * di Roma, non da una data locale del server.
 */
function giorniDi(gare: readonly GaraExpected[]): ReadonlyArray<{
  readonly chiave: string;
  readonly titolo: string;
  readonly gare: readonly GaraExpected[];
}> {
  const oggi = GIORNO.format(new Date());
  const domani = GIORNO.format(new Date(Date.now() + 86_400_000));
  const per = new Map<string, GaraExpected[]>();
  for (const g of [...gare].sort((a, b) => a.kickoff.localeCompare(b.kickoff))) {
    const chiave = GIORNO.format(new Date(g.kickoff));
    const gia = per.get(chiave);
    if (gia === undefined) per.set(chiave, [g]);
    else gia.push(g);
  }
  return [...per].map(([chiave, delGiorno]) => ({
    chiave,
    titolo: chiave === oggi
      ? "Oggi"
      : chiave === domani
        ? "Domani"
        : new Date(delGiorno[0].kickoff).toLocaleDateString("it-IT", TESTATA),
    gare: delGiorno,
  }));
}

/** L'indice: una riga per gara, e la riga porta alla gara. */
function Indice({ gare, calcolatoIl }: {
  readonly gare: readonly GaraExpected[];
  readonly calcolatoIl: string;
}) {
  return (
    <>
      <section className="page-intro" aria-labelledby="expected-title">
        <p className="eyebrow">Expected</p>
        <h1 id="expected-title">
          {gare.length === 1 ? "Una gara in arrivo." : `${gare.length} gare in arrivo.`}
        </h1>
        <p className="home-lede home-legenda">
          <b>Probabilita&apos; del motore, con la soglia.</b> Calcolato il{" "}
          {quando(calcolatoIl)} · consuntivo su {GARE_DEL_CONSUNTIVO.toLocaleString("it-IT")}{" "}
          gare chiuse
        </p>
      </section>

      {/* **Solo il primo giorno sta aperto.** Chi apre Expected sta scegliendo una gara di
          oggi; domani e' una domanda diversa. Misurato l'11 settembre 2026: 83 gare su 102
          erano di domani, e tutte in vista facevano 13.940 px a 375 px, trenta schermate.
          Il conteggio resta scritto nel sommario, quindi non sparisce niente: si apre. */}
      {giorniDi(gare).map(({ chiave, titolo, gare: delGiorno }, indice) => (
        <details className="expected-giorno" key={chiave} open={indice === 0}>
          <summary className="expected-giorno-titolo">
            {titolo} <span className="engine-obs">{delGiorno.length} gare</span>
          </summary>
          <ol className="partite-rows">
        {delGiorno.map((g) => (
          <li key={g.gara}>
            <Link className="expected-voce" href={indirizzoDi(g)}>
              <span className="expected-gara-squadre">
                <TeamCrest name={g.casa} teamId={g.casaId} />
                {g.casa} contro <TeamCrest name={g.fuori} teamId={g.fuoriId} />
                {g.fuori}
              </span>
              <span className="engine-obs">
                {ora(g.kickoff)} · {g.lega ?? "competizione non dichiarata"}
                {g.famiglie.length === 7 ? "" : ` · ${g.famiglie.length} famiglie su 7`}
              </span>
              {g.consigliato === null ? (
                <span className="engine-obs">nessun consigliato per questa gara</span>
              ) : (
                <span className="expected-sintesi">
                  <b>{linea(g.consigliato)}</b>
                  {" · "}
                  {chiRiguarda(g.consigliato.lato, g.casa, g.fuori)}
                  {" · "}
                  <b>{Math.round(g.consigliato.probabilita * 100)}%</b>
                </span>
              )}
            </Link>
          </li>
        ))}
          </ol>
        </details>
      ))}
    </>
  );
}

/** La gara: le due squadre, le loro famiglie con le soglie, il consigliato motivato. */
function Gara({ g, calcolatoIl, quoteIl }: {
  readonly g: GaraExpected;
  readonly calcolatoIl: string;
  readonly quoteIl: string | null;
}) {
  const resa = g.consigliato === null ? null : resaDelBersaglio(g.consigliato.bersaglio);
  const scarto = g.consigliato === null ? null : g.consigliato.scarto;

  return (
    <>
      <section className="page-intro" aria-labelledby="expected-title">
        <p className="eyebrow">
          <Link href="/expected">Expected</Link> · {g.lega ?? "competizione non dichiarata"}
        </p>
        <h1 id="expected-title" className="expected-gara-squadre">
          <TeamCrest name={g.casa} teamId={g.casaId} />
          {g.casa} contro <TeamCrest name={g.fuori} teamId={g.fuoriId} />
          {g.fuori}
        </h1>
        <p className="home-lede home-legenda">
          {quando(g.kickoff)} · calcolato il {quando(calcolatoIl)} · consuntivo su{" "}
          {GARE_DEL_CONSUNTIVO.toLocaleString("it-IT")} gare chiuse
        </p>
      </section>

      {g.consigliato === null ? (
        /* Un consigliato assente si dichiara: nessuna lettura di questa gara si stacca
           abbastanza dalla norma del campionato, e inventarne una sarebbe il pronostico
           banale che la soglia di scarto esiste per evitare. */
        <section className="expected-consiglio" aria-labelledby="expected-consiglio-title">
          <p className="eyebrow" id="expected-consiglio-title">Nessun consigliato</p>
          <p className="expected-perche">
            Su questa gara nessuna delle letture si stacca abbastanza dalla norma del suo
            campionato. Le famiglie restano qui sotto con i loro numeri: quello che manca è
            una lettura che aggiunga qualcosa a quanto succede normalmente.
          </p>
        </section>
      ) : (
        <section className="expected-consiglio" aria-labelledby="expected-consiglio-title">
          <p className="eyebrow" id="expected-consiglio-title">Consigliato</p>
          <p className="expected-lettura">
            <b>{linea(g.consigliato)}</b> · {chiRiguarda(g.consigliato.lato, g.casa, g.fuori)}
            {" · "}
            <b>{Math.round(g.consigliato.probabilita * 100)}%</b>
          </p>
          <Motivazione r={g.consigliato} />
          <ul className="expected-motivi">
            {scarto === null ? null : (
              <li>È lo scarto più grande di questa gara: {scarto > 0 ? "+" : ""}
                {virgola(scarto)} punti sopra la norma del campionato.</li>
            )}
            {/* La resa della famiglia sulle gare gia' chiuse: e' la meta' che rende questo
                un consiglio misurato invece che una promessa. */}
            {resa === null ? (
              <li>Di questa famiglia non abbiamo ancora un consuntivo.</li>
            ) : (
              <li>
                Sulle gare già chiuse questa famiglia ha reso{" "}
                <b>{virgola(resa.frequenzaOsservata * 100)}%</b> contro il{" "}
                {virgola(resa.probabilitaPromessa * 100)}% promesso, su {resa.letture}{" "}
                letture.
              </li>
            )}
          </ul>
        </section>
      )}

      <ol className="partite-rows expected-famiglie">
        {g.famiglie.map((r) => (
          <Famiglia
            key={`${r.bersaglio}-${r.lato}-${r.soglia}-${r.verso}`}
            r={r}
            casa={g.casa}
            fuori={g.fuori}
          />
        ))}
      </ol>

      <Mercato g={g} raccolteIl={quoteIl} />

      {g.senzaMisura.length === 0 ? null : (
        /* Una copertura assente si dichiara in una riga, non in tre blocchi vuoti: tre
           schede senza numeri sono mezzo schermo che non dice niente. */
        <p className="engine-obs expected-mancanti">
          Mancano {g.senzaMisura.length === 1 ? "una famiglia" : `${g.senzaMisura.length} famiglie`}:{" "}
          {g.senzaMisura.map(nomeFamiglia).join(", ")} — l&apos;arbitro non è ancora designato.
        </p>
      )}

      <Riepilogo g={g} />

      <ComeSiLegge />

      <p className="expected-apri">
        <Link href={`/match/${g.gara}`}>Apri il dossier della gara</Link>
      </p>
    </>
  );
}

export default async function ExpectedPage(
  { searchParams }: Readonly<{ searchParams: SearchParams }>,
) {
  const [query, expected] = await Promise.all([searchParams, expectedDelleGare()]);

  if (expected === null) {
    return (
      <ProductShell activeSection="expected">
        <section className="page-intro" aria-labelledby="expected-title">
          <p className="eyebrow">Expected</p>
          <h1 id="expected-title">Nessuna gara in arrivo con una proiezione.</h1>
          {/* Un'assenza si dichiara assenza: l'artefatto e' vecchio o le gare che copriva
              sono gia' cominciate. Non si mostra una pagina vuota che sembra piena. */}
          <p>
            L&apos;elenco viene da un calcolo offline, e quello disponibile non copre nessuna
            gara ancora da giocare. Le proiezioni della singola gara restano dentro il suo{" "}
            <Link href="/partite">dossier</Link>.
          </p>
        </section>
      </ProductShell>
    );
  }

  const { gare, calcolatoIl, quoteRaccolteIl } = expected;
  const chiesta = unoSolo(query.fixtureId);
  const gara = chiesta === null ? null : gare.find((g) => String(g.gara) === chiesta) ?? null;

  if (chiesta !== null && gara === null) {
    return (
      <ProductShell activeSection="expected">
        <section className="page-intro" aria-labelledby="expected-title">
          <p className="eyebrow"><Link href="/expected">Expected</Link></p>
          <h1 id="expected-title">Questa gara non è nell&apos;elenco.</h1>
          {/* Non si finge una pagina: o la gara e' gia' cominciata - e allora non e' piu'
              una proiezione - o il calcolo offline non la copre. */}
          <p>
            O è già cominciata, e allora non è più una proiezione, oppure il calcolo offline
            non la copre. L&apos;<Link href="/expected">elenco delle gare in arrivo</Link>{" "}
            dice quali ci sono.
          </p>
        </section>
      </ProductShell>
    );
  }

  return (
    <ProductShell activeSection="expected">
      {gara === null
        ? <Indice gare={gare} calcolatoIl={calcolatoIl} />
        : <Gara g={gara} calcolatoIl={calcolatoIl} quoteIl={quoteRaccolteIl} />}
    </ProductShell>
  );
}
