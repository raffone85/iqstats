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
import {
  chiRiguarda,
  linea,
  nomeFamiglia,
  soglia,
  VoceDiGara,
} from "@/components/expected-voce";
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

function quando(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? "orario non disponibile"
    : data.toLocaleString("it-IT", QUANDO);
}

function virgola(valore: number): string {
  return valore.toFixed(1).replace(".", ",");
}

/** Lo scarto fra quanto diciamo noi e quanto succede in quel campionato, in punti. */
function scartoDi(r: RigaDiFamiglia): number | null {
  return r.base === null ? null : Number((r.probabilita * 100 - r.base).toFixed(1));
}

/** Quante gare stanno in vista, per giorno, prima del comando che apre le altre. */
const IN_VISTA = 20;

/** Il primo parametro, quando la stessa chiave arriva ripetuta. */
function unoSolo(valore: string | string[] | undefined): string | null {
  if (Array.isArray(valore)) return valore[0] ?? null;
  return valore ?? null;
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
 * Una famiglia, una volta sola: quanto ne attende il motore, la lettura, le linee quotate.
 *
 * **Prima erano due blocchi lontani.** Le sette famiglie aprivano la pagina con le loro
 * cause, e piu' sotto «Le quote di Fastbet» ripeteva le stesse sette con i prezzi del
 * banco: la stessa gara raccontata due volte, e la lettura in cima senza il prezzo accanto
 * anche quando il banco quotava esattamente quella soglia - misurato sull'artefatto dell'11
 * settembre 2026, **74 righe su 938**, il 7,9%. Qui la famiglia e' un posto solo.
 *
 * **Quando manca il nostro numero si dice perche'.** Il banco quota anche i bersagli che
 * dipendono dall'arbitro, e finche' la designazione non c'e' quelle scale ripiegano: 429
 * righe su 3.870. Una colonna di trattini senza la sua ragione si legge come un guasto.
 */
function BloccoDiFamiglia({ bersaglio, lettura, righe, atteso, casa, fuori, senzaArbitro, apri }: {
  readonly bersaglio: string;
  readonly lettura: RigaDiFamiglia | null;
  readonly righe: readonly RigaQuotata[];
  readonly atteso: number | null;
  readonly casa: string;
  readonly fuori: string;
  readonly senzaArbitro: boolean;
  readonly apri: boolean;
}) {
  const lati: ReadonlyArray<RigaQuotata["lato"]> = ["casa", "trasferta", "totale"];
  const mute = righe.length > 0 && righe.every((r) => r.probabilita === null);
  const scarto = lettura === null ? null : scartoDi(lettura);
  const quante = righe.length;
  return (
    <details className="famiglia-blocco" open={apri}>
      {/* **Una famiglia parte aperta, e non e' la prima dell'elenco.** Con tutte chiuse
          non si vedeva nessun prezzo finche' non se ne apriva una. L'elenco pero' e'
          ordinato per scarto dalla media, non per copertura del banco: sull'artefatto
          dell'11 settembre 2026 la prima famiglia aveva almeno una linea quotata in 24
          gare su 161, mentre la prima *quotata* ce l'ha per definizione in 128 su 161.
          Si apre quella: mediana dieci righe. */}
      {/* **Chiusa si legge la lettura, aperta si leggono le quote.** Il sommario porta
          quello che serve a decidere se aprire - la famiglia, quanto se ne attende, la
          nostra lettura con la sua probabilita' - e le linee del banco stanno dentro: su
          una gara ben quotata sono trentasei, e tutte in vista facevano della pagina un
          elenco invece di una lettura. */}
      <summary className="famiglia-testa">
        <span className="famiglia-nome">{nomeFamiglia(bersaglio)}</span>
        {atteso === null ? null : <i>attesi {virgola(atteso)}</i>}
        {lettura === null ? null : (
          <span className="famiglia-sintesi">
            {linea(lettura)} · <b>{Math.round(lettura.probabilita * 100)}%</b>
          </span>
        )}
        {quante === 0 ? null : <em>{quante} linee</em>}
      </summary>

      {lettura === null ? null : (
        <p className="famiglia-lettura">
          <b>{linea(lettura)}</b>
          <span className="famiglia-lettura-lato">
            {chiRiguarda(lettura.lato, casa, fuori)}
          </span>
          <b className="famiglia-lettura-valore">
            {Math.round(lettura.probabilita * 100)}%
          </b>
          {scarto === null ? null : (
            <span className={scarto > 0 ? "is-sopra" : "is-sotto"}>
              {scarto > 0 ? "+" : "−"}{virgola(Math.abs(scarto))} sul campionato
            </span>
          )}
        </p>
      )}

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
            <p className="quota-lato-titolo">{chiRiguarda(lato, casa, fuori)}</p>
            <ul className="quota-righe">
              {diLato.map((r) => (
                <RigaDiMercato key={`${r.verso}-${r.soglia}`} r={r} />
              ))}
            </ul>
          </div>
        );
      })}

      {lettura === null || lettura.cause.length === 0 ? null : (
        <details className="famiglia-perche">
          <summary>Perché questo numero</summary>
          <Motivazione r={lettura} />
        </details>
      )}
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
    <details className="famiglia-blocco">
      {/* Il sommario dice la stessa cosa delle altre famiglie: quanto se ne attende e la
          lettura piu' corta che si possa dare, cosi' chiuse si confrontano fra loro. */}
      <summary className="famiglia-testa">
        <span className="famiglia-nome">Gol</span>
        <i>attesi {virgola(nostri.attesiCasa + nostri.attesiTrasferta)}</i>
        <span className="famiglia-sintesi">
          {nostri.esito.uno > nostri.esito.due ? casa : fuori} ·{" "}
          <b>{Math.round(Math.max(nostri.esito.uno, nostri.esito.due) * 100)}%</b>
          {" · Gol "}
          <b>{Math.round(nostri.gg * 100)}%</b>
        </span>
      </summary>
      {/* **Su che cosa poggiano questi numeri, e su che cosa no.** Le forze delle due
          squadre vengono dalle reti segnate e subite, non dagli expected goals: misurato
          l'11 settembre 2026, il campo xG della fonte vale 0,02 in LaLiga 2 su 88
          osservazioni e 0,55 in J1 League su 120, e costruirci sopra dava dieci gare di
          Segunda Division con 0,02 gol attesi in tutto. Gli xG restano scritti qui, con il
          metro della loro competizione accanto, perche' dove sono popolati dicono la
          qualita' delle occasioni - e perche' senza quel confronto uno 0,00 sembra una
          squadra che non tira invece di un campo vuoto. */}
      <p className="quota-assenza">
        Forze dalle reti di {nostri.campioneCasa} gare in casa e{" "}
        {nostri.campioneTrasferta} in trasferta, sulle {nostri.campioneLega} del campionato.
        {nostri.xgCasa === null || nostri.xgTrasferta === null ? "" : (
          ` Gli expected goals delle stesse gare dicono ${virgola(nostri.xgCasa)} e `
          + `${virgola(nostri.xgTrasferta)}`
          + (nostri.xgLegaCasa === null || nostri.xgLegaTrasferta === null
            ? ", e non entrano nel calcolo."
            : `, contro ${virgola(nostri.xgLegaCasa)} e ${virgola(nostri.xgLegaTrasferta)} `
              + "del campionato: non entrano nel calcolo.")
        )}
      </p>
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

      {/* **I multigol si aprono, non stanno aperti.** Il banco ne quota ventisette per la
          partita e ventiquattro per squadra: settantacinque righe che da sole facevano
          meta' della pagina della gara, per una domanda che quasi nessuno si fa prima di
          aver letto il resto. Il conteggio resta nel sommario, quindi non sparisce niente. */}
      {multigol.map((m) => (m.loro.length === 0 ? null : (
        <details key={m.titolo} className="quota-lato quota-multigol">
          <summary>
            {m.titolo}
            <i>{m.loro.length} linee</i>
          </summary>
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
        </details>
      )))}
    </details>
  );
}

/**
 * Le famiglie della gara, una per blocco, con i gol in testa.
 *
 * **L'ordine non e' alfabetico e non e' la probabilita'.** Prima i gol, che il banco quota
 * su tutte le gare e sono la domanda che chiunque si fa per prima; poi le famiglie dove il
 * motore ha una lettura, dalla piu' staccata dalla norma del campionato; infine quelle che
 * hanno solo le quote del banco. Ordinare per probabilita' metterebbe in cima la cosa piu'
 * ovvia, che e' lo stesso difetto per cui il consigliato passa dallo scarto.
 */
function Famiglie({ g, raccolteIl }: {
  readonly g: GaraExpected;
  readonly raccolteIl: string | null;
}) {
  const perFamiglia = new Map<string, RigaQuotata[]>();
  for (const r of g.quote) {
    const gia = perFamiglia.get(r.bersaglio);
    if (gia === undefined) perFamiglia.set(r.bersaglio, [r]);
    else gia.push(r);
  }
  const letture = new Map(g.famiglie.map((r) => [r.bersaglio, r]));
  const bersagli = [...new Set([...letture.keys(), ...perFamiglia.keys()])];
  bersagli.sort((a, b) => {
    const la = letture.get(a);
    const lb = letture.get(b);
    if ((la === undefined) !== (lb === undefined)) return la === undefined ? 1 : -1;
    const sa = la === undefined ? 0 : Math.abs(scartoDi(la) ?? 0);
    const sb = lb === undefined ? 0 : Math.abs(scartoDi(lb) ?? 0);
    return sb - sa;
  });

  // La prima famiglia che ha davvero delle linee: e' quella che si apre da sola.
  const primaQuotata = bersagli.findIndex((b) => (perFamiglia.get(b)?.length ?? 0) > 0);

  if (bersagli.length === 0 && g.gol === null) return null;

  return (
    <section className="famiglie-blocchi" aria-labelledby="famiglie-title">
      <h2 id="famiglie-title" className="sr-only-heading">Le famiglie del motore</h2>
      {g.gol === null ? null : <MercatoDeiGol g={g.gol} casa={g.casa} fuori={g.fuori} />}
      {bersagli.map((bersaglio, indice) => (
        <BloccoDiFamiglia
          key={bersaglio}
          apri={indice === primaQuotata}
          bersaglio={bersaglio}
          lettura={letture.get(bersaglio) ?? null}
          righe={perFamiglia.get(bersaglio) ?? []}
          atteso={attesoDi(g.attesi, bersaglio, "totale")}
          casa={g.casa}
          fuori={g.fuori}
          senzaArbitro={g.senzaMisura.includes(bersaglio)}
        />
      ))}
      {raccolteIl === null ? null : (
        <p className="engine-obs famiglie-fonte">
          Le quote sono di Fastbet, raccolte il {quando(raccolteIl)}. Le probabilità sono
          del nostro modello: nessuna delle due entra nel calcolo dell&apos;altra.
        </p>
      )}
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
 * Che partita sara': quattro numeri in cima, prima di ogni spiegazione.
 *
 * **E' la prima cosa che si legge aprendo una gara**, e non ripete niente di quello che
 * sta sotto: la' ci sono le linee con le loro quote, qui c'e' il ritratto della partita.
 * Prima questi stessi numeri stavano in fondo, dopo tredici schermate, e ripetevano gli
 * attesi gia' scritti in ogni riga di famiglia.
 *
 * **Non e' un pronostico e non ne aggiunge uno.** Il consigliato ha il suo criterio, di
 * cui il consuntivo conosce la resa; qui non si ordina niente per probabilita'.
 */
function CheGaraSara({ g }: { readonly g: GaraExpected }) {
  const nostri = g.gol?.nostri ?? null;
  const voci: Array<{ readonly titolo: string; readonly valore: string; readonly sotto: string }> = [];

  if (nostri !== null) {
    const totali = nostri.attesiCasa + nostri.attesiTrasferta;
    const forza = Math.abs(nostri.esito.uno - nostri.esito.due);
    voci.push({
      titolo: "Gol attesi",
      valore: virgola(totali),
      sotto: `${virgola(nostri.attesiCasa)} contro ${virgola(nostri.attesiTrasferta)}`,
    });
    voci.push({
      titolo: forza < 0.08 ? "Equilibrio" : "Favorita",
      valore: forza < 0.08
        ? `${Math.round(nostri.esito.x * 100)}%`
        : `${Math.round(Math.max(nostri.esito.uno, nostri.esito.due) * 100)}%`,
      sotto: forza < 0.08
        ? "il pareggio, e nessuna delle due si stacca"
        : nostri.esito.uno > nostri.esito.due ? g.casa : g.fuori,
    });
  }
  for (const [bersaglio, titolo] of [
    ["corner_kicks", "Corner"], ["fouls", "Falli"], ["yellow_cards", "Cartellini"],
  ] as const) {
    const atteso = attesoDi(g.attesi, bersaglio, "totale");
    if (atteso === null || voci.length >= 5) continue;
    voci.push({ titolo, valore: virgola(atteso), sotto: "attesi in tutto" });
  }
  if (voci.length === 0) return null;

  return (
    <section className="gara-verdetto" aria-labelledby="gara-verdetto-title">
      <h2 id="gara-verdetto-title" className="sr-only-heading">Che partita sarà</h2>
      <ul className="verdetto-voci">
        {voci.map((v) => (
          <li key={v.titolo}>
            <span className="verdetto-titolo">{v.titolo}</span>
            <b className="verdetto-valore">{v.valore}</b>
            <span className="verdetto-sotto">{v.sotto}</span>
          </li>
        ))}
      </ul>
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
          {/* **Venti in vista, il resto dietro un comando solo**, come su Pronostici. Il
              giorno corrente ne porta settantatre, 9.075 px a 375: il sommario dice quante
              restano, quindi non sparisce niente. */}
          <ol className="partite-rows">
            {delGiorno.slice(0, IN_VISTA).map((g) => <VoceDiGara key={g.gara} g={g} />)}
          </ol>
          {delGiorno.length <= IN_VISTA ? null : (
            <details className="altre-voci">
              <summary>le altre {delGiorno.length - IN_VISTA} gare</summary>
              <ol className="partite-rows">
                {delGiorno.slice(IN_VISTA).map((g) => <VoceDiGara key={g.gara} g={g} />)}
              </ol>
            </details>
          )}
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

      <CheGaraSara g={g} />

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

      <Famiglie g={g} raccolteIl={quoteIl} />

      {g.senzaMisura.length === 0 ? null : (
        /* Una copertura assente si dichiara in una riga, non in tre blocchi vuoti: tre
           schede senza numeri sono mezzo schermo che non dice niente. */
        <p className="engine-obs expected-mancanti">
          Mancano {g.senzaMisura.length === 1 ? "una famiglia" : `${g.senzaMisura.length} famiglie`}:{" "}
          {g.senzaMisura.map(nomeFamiglia).join(", ")} — l&apos;arbitro non è ancora designato.
        </p>
      )}

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
