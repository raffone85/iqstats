// Sezione "Giocate statistiche" resa dal motore di proiezione pre-partita.
// Non calcola nulla e non chiama fonti: riceve le proiezioni già prodotte lato server.
//
// Sostituisce la lettura del motore ENG-1 quando c'è, invece di affiancarla: due pannelli
// con due numeri diversi per «tiri in casa» sarebbero due verità sullo stesso schermo.
// Riusa le classi del pannello esistente, così l'aspetto resta quello e non nasce CSS.
import type { CSSProperties } from "react";
import type {
  OsservatoDelBersaglio,
  ProiezioniDellaGara,
} from "@/server/iqstats/projection-runtime";
import type { MediaOsservata } from "@/server/iqstats/projection-store";
import { daAccendere, soglieReali, type Accensione } from "@/server/iqstats/projection/linea-scelta";
import type { Linea, ProiezioneDiGara } from "@/server/iqstats/projection/match";
import type { ProiezioneDiProduzione } from "@/server/iqstats/projection/production";

// Nome e tinta stanno nella **stessa** tabella apposta: due tabelle separate divergono al
// primo bersaglio nuovo, e una famiglia senza tinta prenderebbe il bordeaux in silenzio,
// cioè due card dello stesso colore senza che nessuno se ne accorga.
//
// La tinta è l'unica eccezione alla regola «il colore dichiara un verso» del design system:
// qui dichiara un'identità, che è anche **scritta** nella testata, quindi nessuna
// informazione vive solo nel colore.
export const FAMIGLIE: Record<string, { readonly nome: string; readonly tinta: string }> = {
  total_shots: { nome: "Tiri", tinta: "var(--fam-tiri)" },
  shots_on_target: { nome: "Tiri in porta", tinta: "var(--fam-tiri-porta)" },
  fouls: { nome: "Falli", tinta: "var(--fam-falli)" },
  corner_kicks: { nome: "Corner", tinta: "var(--fam-corner)" },
  yellow_cards: { nome: "Cartellini gialli", tinta: "var(--fam-gialli)" },
  goalkeeper_saves: { nome: "Parate", tinta: "var(--fam-parate)" },
  offsides: { nome: "Fuorigioco", tinta: "var(--fam-fuorigioco)" },
};

function valore(numero: number): string {
  return numero.toFixed(1).replace(".", ",");
}

function percento(quota: number): string {
  return String(Math.round(quota * 100)) + "%";
}

function quando(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "data non disponibile";
  return data.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Rome",
  });
}

function prevista(esito: ProiezioneDiGara["casa"]): esito is ProiezioneDiProduzione {
  return esito.stato === "prevista";
}

/** Il verso di una linea in parole, o `null` quando i due lati sono pari. */
function verso(linea: Linea): { lato: string; quota: number } | null {
  if (percento(linea.probabilitaSopra) === percento(linea.probabilitaSotto)) return null;
  return linea.probabilitaSopra > linea.probabilitaSotto
    ? { lato: "Over", quota: linea.probabilitaSopra }
    : { lato: "Under", quota: linea.probabilitaSotto };
}

/**
 * La frase che spiega perché è accesa quella linea e non un'altra.
 *
 * Non è ornamento: senza, un riquadro acceso viene letto come un consiglio. Qui si dice
 * il criterio e si nominano i numeri che lo reggono.
 */
function spiegazione(linee: readonly Linea[], scelta: Accensione) {
  if (scelta.prima < 0) return null;
  const linea = linee[scelta.prima];
  const v = verso(linea);
  if (v === null) {
    return "Su questo lato nessuna soglia vicina al valore atteso ha un verso deciso: "
      + "la lettura resta aperta, e accendere una casella direbbe più di quanto i numeri sanno.";
  }

  // Si nominano solo le soglie **scartate**: elencare fra le fiacche anche la seconda
  // accesa faceva contraddire la frase con se stessa.
  const scartate = linee
    .map((altra, i) => ({ altra, i }))
    .filter(({ i }) => i > 0 && i < linee.length - 1 && i !== scelta.prima && i !== scelta.seconda)
    .map(({ altra }) => {
      const suo = verso(altra);
      return suo === null
        ? `${valore(altra.soglia)} è una moneta`
        : `${valore(altra.soglia)} sta al ${percento(suo.quota)}`;
    });
  const piuFiacca = scartate.join(", ");

  const seconda = scelta.seconda === null ? null : linee[scelta.seconda];
  const versoSeconda = seconda === null ? null : verso(seconda);

  return (
    <>
      <b>{v.lato} {valore(linea.soglia)} al {percento(v.quota)}</b> è la lettura più decisa fra
      le soglie vicine al valore atteso
      {scartate.length === 0 ? "" : `: ${piuFiacca}, cioè troppo a ridosso del previsto perché il verso conti`}.
      {" "}Le due soglie agli estremi non si accendono mai: la loro forza viene dalla distanza,
      non da un&apos;informazione.
      {seconda !== null && versoSeconda !== null ? (
        <>
          {" "}
          <b>{versoSeconda.lato} {valore(seconda.soglia)} al {percento(versoSeconda.quota)}</b> le
          sta a meno di tre punti: fra le due il modello non sa distinguere, e sono accese
          entrambe apposta.
        </>
      ) : null}
    </>
  );
}

/**
 * Una soglia con **entrambi** i lati, come nel materiale di riferimento.
 *
 * Prima se ne mostrava uno solo, il più probabile, lasciando l'altro implicito: chi legge
 * non poteva confrontare due linee senza fare il complemento a mente.
 */
function Soglia({ linea, acceso }: {
  readonly linea: Linea;
  readonly acceso: "piena" | "tenue" | null;
}) {
  const sopra = percento(linea.probabilitaSopra);
  const sotto = percento(linea.probabilitaSotto);
  const guidaSopra = linea.probabilitaSopra > linea.probabilitaSotto;
  const pari = sopra === sotto;
  const classe = acceso === "piena"
    ? "engine-step is-central"
    : acceso === "tenue" ? "engine-step is-quasi" : "engine-step";

  return (
    <li className={classe}>
      <span className="engine-step-line">{valore(linea.soglia)}</span>
      <span className="engine-step-prob">
        <span className={!pari && guidaSopra ? "engine-side is-lead" : "engine-side"}>
          O {sopra}
        </span>
        <span className={!pari && !guidaSopra ? "engine-side is-lead" : "engine-side"}>
          U {sotto}
        </span>
      </span>
    </li>
  );
}

/** Una voce: chi, quanto ci si attende, e la scala delle soglie. */
function Voce({ chi, atteso, linee, osservato, dove }: {
  readonly chi: string;
  readonly atteso: number;
  readonly linee: readonly Linea[] | null;
  readonly osservato?: MediaOsservata | null;
  readonly dove?: string;
}) {
  // Le soglie sotto zero non si mostrano: un conteggio non scende sotto zero, e
  // «Over -0,5 al 100%» entrerebbe fra le tre centrali che la regola confronta.
  const scala = linee === null ? null : soglieReali(linee);
  const scelta = scala === null ? { prima: -1, seconda: null } : daAccendere(scala);
  return (
    <li className="engine-split">
      <span className="engine-who">
        {chi}
        {osservato === null || osservato === undefined ? null : (
          <span className="engine-obs">
            osservato {dove} {valore(osservato.media)} su {osservato.campione}{" "}
            {osservato.campione === 1 ? "gara" : "gare"}
          </span>
        )}
      </span>
      <span className="engine-exp">
        {valore(atteso)}
        <span className="engine-obs">atteso</span>
      </span>
      {scala === null || scala.length === 0 ? null : (
        <>
          <ol className="engine-ladder">
            {scala.map((linea, indice) => (
              <Soglia
                key={linea.soglia}
                linea={linea}
                acceso={
                  indice === scelta.prima ? "piena"
                    : indice === scelta.seconda ? "tenue" : null
                }
              />
            ))}
          </ol>
          <p className="engine-why">{spiegazione(scala, scelta)}</p>
        </>
      )}
    </li>
  );
}

/**
 * L'affidabilità come punteggio con la sua fascia di lettura.
 *
 * Non è la probabilità dell'evento e non si somma alle percentuali delle soglie: è la
 * quota di volte in cui, fuori campione, lo scarto è rimasto entro la soglia dichiarata.
 */
function Affidabilita({ bersaglio }: { readonly bersaglio: ProiezioneDiGara }) {
  const livello = bersaglio.totale === null ? null : bersaglio.totale.affidabilita;
  if (livello === null) return null;
  return (
    <p className="engine-badge">
      Affidabilità del totale {livello.punteggio}/100 · {livello.fasciaDiLettura.toLowerCase()}
      {" "}· entro {valore(livello.soglia)} su {livello.righeDiProva} gare di prova
    </p>
  );
}

function Bersaglio({ bersaglio, casa, trasferta, osservato }: {
  readonly bersaglio: ProiezioneDiGara;
  readonly casa: string;
  readonly trasferta: string;
  readonly osservato: OsservatoDelBersaglio | undefined;
}) {
  const lCasa = bersaglio.casa;
  const lTrasferta = bersaglio.trasferta;
  if (!prevista(lCasa) || !prevista(lTrasferta)) return null;
  const famiglia = FAMIGLIE[bersaglio.target];

  return (
    <li
      className="engine-row is-famiglia"
      style={{ "--famiglia": famiglia?.tinta ?? "var(--card-brand)" } as CSSProperties}
    >
      <p className="engine-metric">{famiglia?.nome ?? bersaglio.target}</p>
      <ul className="engine-splits">
        <Voce
          chi={casa}
          atteso={lCasa.valoreAtteso}
          linee={bersaglio.linee.casa}
          osservato={osservato?.casa}
          dove="in casa"
        />
        <Voce
          chi={trasferta}
          atteso={lTrasferta.valoreAtteso}
          linee={bersaglio.linee.trasferta}
          osservato={osservato?.trasferta}
          dove="fuori casa"
        />
        {bersaglio.totale === null ? null : (
          <Voce
            chi="Totale gara"
            atteso={bersaglio.totale.valoreAtteso}
            linee={bersaglio.totale.linee}
          />
        )}
      </ul>
      <Affidabilita bersaglio={bersaglio} />
    </li>
  );
}

type Props = {
  readonly proiezioni: ProiezioniDellaGara;
  readonly homeTeam: string;
  readonly awayTeam: string;
};

export function MatchProjectionSection({ proiezioni, homeTeam, awayTeam }: Props) {
  const mostrabili = proiezioni.bersagli.filter(
    (bersaglio) => bersaglio.casa.stato === "prevista" && bersaglio.trasferta.stato === "prevista",
  );
  // Una sezione appare solo quando il suo contratto dati c'è: senza nemmeno un bersaglio
  // completo non si dichiara copertura, si tace.
  if (mostrabili.length === 0) return null;

  const senzaCopertura = proiezioni.bersagli
    .filter((bersaglio) => !mostrabili.includes(bersaglio))
    .map((bersaglio) => FAMIGLIE[bersaglio.target]?.nome ?? bersaglio.target);

  return (
    <section className="dossier-panel" aria-labelledby="projection-title">
      <p className="dossier-kick">Giocate statistiche</p>
      <h2 id="projection-title" className="sr-only-heading">
        Proiezione pre-partita del motore IQstatS
      </h2>

      <ul className="engine-rows">
        {mostrabili.map((bersaglio) => (
          <Bersaglio
            key={bersaglio.target}
            bersaglio={bersaglio}
            casa={homeTeam}
            trasferta={awayTeam}
            osservato={proiezioni.osservate[bersaglio.target]}
          />
        ))}
      </ul>

      <p className="dossier-src">
        Ogni bersaglio è letto tre volte: quanto ne produce ciascuna squadra e quanto ne esce
        dalla gara. Il numero grande a sinistra è il valore atteso; accanto, fino a cinque
        soglie con <b>entrambi i lati</b>, Over e Under, così due linee si confrontano senza
        fare il complemento a mente. Dove se ne vedono meno di cinque è perché le altre
        cadrebbero sotto zero: un conteggio non scende sotto zero, e &laquo;Over -0,5 al
        100%&raquo; non è una lettura. Il totale è la somma dei due lati, sempre. È una lettura
        probabilistica, non un consiglio di giocata.
      </p>

      <p className="dossier-src">
        <b>La casella accesa non è un consiglio, è una regola dichiarata.</b> Si accende la
        soglia su cui il verso è più deciso <b>fra le tre vicine al valore atteso</b>. Le due
        agli estremi non si accendono mai: con un atteso di 9,3 un &laquo;Over 6,5 al 75%&raquo;
        è vero e inutile, perché la sua forza viene dalla distanza e non da un&apos;informazione.
        A ridosso del previsto, invece, il verso è quasi una moneta. Quando due letture distano
        meno di tre punti sono accese entrambe, la seconda tratteggiata: il modello non sa
        distinguerle, e sceglierne una fingerebbe una precisione che non ha.
      </p>
      <p className="dossier-src">
        Sotto il nome di ogni squadra c&apos;è quanto ha prodotto <b>davvero</b> prima di
        questa gara, dallo stesso lato del campo e nella stessa stagione: la squadra di casa
        nelle sue gare in casa, l&apos;ospite nelle sue gare fuori. È il numero osservato
        accanto a quello previsto, con il campione su cui poggia. Dove manca, la squadra non
        ha ancora gare utili da quel lato: non si stima nulla.
      </p>

      <p className="dossier-src">
        L&apos;affidabilità è la quota di volte in cui lo scarto fra previsto e osservato è
        rimasto entro la soglia dichiarata, misurata su gare mai usate per costruire il
        modello. <b>Non è la probabilità dell&apos;evento</b>: sono due numeri diversi e non si
        sommano.
      </p>

      {senzaCopertura.length > 0 ? (
        <p className="dossier-src">
          Bersagli senza copertura per questa gara: {senzaCopertura.join(", ")}. Non si
          stimano: si dichiarano assenti.
        </p>
      ) : null}

      <p className="dossier-src">
        Proiezione pre-partita di IQstatS · storia aggiornata al{" "}
        {proiezioni.ultimaOsservazione === null
          ? "data non disponibile"
          : quando(proiezioni.ultimaOsservazione)}{" "}
        · letture, non certezze.
      </p>
    </section>
  );
}
