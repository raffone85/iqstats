// Sezione "Giocate statistiche" resa dal motore di proiezione pre-partita.
// Non calcola nulla e non chiama fonti: riceve le proiezioni già prodotte lato server.
//
// Sostituisce la lettura del motore ENG-1 quando c'è, invece di affiancarla: due pannelli
// con due numeri diversi per «tiri in casa» sarebbero due verità sullo stesso schermo.
// Riusa le classi del pannello esistente, così l'aspetto resta quello e non nasce CSS.
import type {
  OsservatoDelBersaglio,
  ProiezioniDellaGara,
} from "@/server/iqstats/projection-runtime";
import type { MediaOsservata } from "@/server/iqstats/projection-store";
import type { Linea, ProiezioneDiGara } from "@/server/iqstats/projection/match";
import type { ProiezioneDiProduzione } from "@/server/iqstats/projection/production";

const NOMI: Record<string, string> = {
  total_shots: "Tiri",
  shots_on_target: "Tiri in porta",
  fouls: "Falli",
  corner_kicks: "Corner",
  yellow_cards: "Cartellini gialli",
  goalkeeper_saves: "Parate",
  offsides: "Fuorigioco",
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

/** Una soglia: si mostra il lato più probabile, l'altro è il complemento. */
function Soglia({ linea, centrale }: { readonly linea: Linea; readonly centrale: boolean }) {
  const sopra = percento(linea.probabilitaSopra);
  const sotto = percento(linea.probabilitaSotto);
  // Con le due percentuali mostrate identiche non c'è un lato più probabile: indicarne
  // uno sarebbe un segnale che la distribuzione non dà.
  const pari = sopra === sotto;
  const guidaSopra = linea.probabilitaSopra > linea.probabilitaSotto;

  return (
    <li className={centrale ? "engine-step is-central" : "engine-step"}>
      <span className="engine-step-line">{valore(linea.soglia)}</span>
      <span className="engine-step-prob">
        {pari ? "pari 50%" : (guidaSopra ? "Over " + sopra : "Under " + sotto)}
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
  // La soglia centrale è la terza delle cinque: è la convenzione del lato che misura.
  const centrale = linee === null ? -1 : Math.floor(linee.length / 2);
  return (
    <li className="engine-split">
      <span className="engine-who">
        {chi}
        {osservato === null || osservato === undefined ? null : (
          <span className="engine-obs">
            {dove} {valore(osservato.media)} su {osservato.campione}{" "}
            {osservato.campione === 1 ? "gara" : "gare"}
          </span>
        )}
      </span>
      <span className="engine-exp">{valore(atteso)}</span>
      {linee === null ? null : (
        <ol className="engine-ladder">
          {linee.map((linea, indice) => (
            <Soglia key={linea.soglia} linea={linea} centrale={indice === centrale} />
          ))}
        </ol>
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

  return (
    <li className="engine-row">
      <p className="engine-metric">{NOMI[bersaglio.target] ?? bersaglio.target}</p>
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
    .map((bersaglio) => NOMI[bersaglio.target] ?? bersaglio.target);

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
        dalla gara. Il numero grande a sinistra è il valore atteso; accanto, cinque soglie con
        il lato più probabile &mdash; l&apos;altro lato è il complemento a 100%. Il totale è la
        somma dei due lati, sempre. È una lettura probabilistica, non un consiglio di giocata.
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
