import type { Metadata } from "next";
import Link from "next/link";

import { CalendarioGiornate } from "@/components/calendario-giornate";
import { ProductShell } from "@/components/product-shell";
import { coperturaDelleGare } from "@/server/iqstats/copertura";
import { prossimeGiornate } from "@/server/iqstats/giornate";
import { getMatchesByDate, getMatchesInRange } from "@/server/iqstats/matches";
import { getPredictionsByDate } from "@/server/iqstats/predictions";
import { medieDiMercato, sbilanciDelGiorno } from "@/server/iqstats/sbilanci";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "IQstatS",
  description:
    "Le sezioni di IQstatS in una sola pagina: gare di oggi, letture del modello, calendario, squadre e metodo.",
};

const KICKOFF_TIME: Intl.DateTimeFormatOptions = {
  timeZone: "Europe/Rome",
  hour: "2-digit",
  minute: "2-digit",
};

/** Quanto avanti si guarda per trovare la prossima giornata di ogni campionato. */
const GIORNI_AVANTI = 10;

/**
 * I cinque campionati sempre aperti, con l'identificativo della fonte.
 *
 * Sono i cinque che il livello dati copre da piu' tempo: Premier League 389 gare, La Liga
 * 394, Serie A 388, Ligue 1 318, Bundesliga 308. Il resto va nel menu a tendina.
 */
const PRINCIPALI: readonly number[] = [1, 3, 4, 5, 6];

/** Le coppe europee: compaiono solo quando hanno gare nella finestra. */
const EUROPEE: readonly number[] = [7, 8, 83];

/**
 * Il giorno universale a `quanti` giorni da un giorno dato.
 *
 * Si parte dalla data e non dall'orologio: `Date.now()` durante il render e' impuro, e la
 * regola `react-hooks/purity` lo rifiuta a ragione. La data di partenza e' gia' quella
 * italiana del prodotto, quindi la finestra resta ancorata allo stesso giorno dei conteggi.
 */
function giornoPiu(dateIso: string, quanti: number): string {
  const data = new Date(`${dateIso}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + quanti);
  return data.toISOString().slice(0, 10);
}

/** Il giorno del prodotto è quello italiano, come il taglio usato per leggere le gare. */
function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

/**
 * **Il titolo dice quante gare, non quale.** Diceva su quale gara il modello si sbilancia
 * di piu': la stessa che adesso e' la prima riga, subito sotto, con il suo scarto accanto.
 * Quattordici parole per ripetere una riga. Il conteggio, invece, le righe non lo danno.
 */
function headline(available: boolean, count: number) {
  if (!available) return "Le sezioni di IQstatS.";
  if (count === 0) return "Oggi non ci sono gare in programma.";
  return count === 1
    ? <>Oggi c&apos;è una gara da leggere.</>
    : <>Oggi ci sono {count} gare da leggere.</>;
}

/** Le cifre di uno scarto: un decimale, virgola, e il segno perche' e' una distanza con verso. */
function punti(valore: number): string {
  return "+".concat(valore.toFixed(1).replace(".", ","));
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalare(valore: string | string[] | undefined): string {
  return typeof valore === "string" ? valore : "";
}

export default async function HomePage({ searchParams }: Props) {
  const parametri = await searchParams;
  const today = todayKey();
  // Gare e letture dello stesso giorno: due grandezze diverse, e il loro rapporto è la
  // copertura del modello. Un numero solo mentirebbe su una delle due.
  const fino = giornoPiu(today, GIORNI_AVANTI);
  const [matchesResult, predictionsResult, medie, finestra] = await Promise.all([
    getMatchesByDate(today),
    getPredictionsByDate(today),
    medieDiMercato(),
    getMatchesInRange(today, fino),
  ]);

  // La prossima giornata di ogni competizione. In fascia i cinque principali e poi le
  // coppe europee, nell'ordine dichiarato: quello per peso, non per orario, cosi' la
  // fascia non cambia ordine da un'ora all'altra.
  const giornate = prossimeGiornate(finestra.matches);
  const inFascia = (id: number) => PRINCIPALI.includes(id) || EUROPEE.includes(id);
  const fascia = [...PRINCIPALI, ...EUROPEE]
    .map((id) => giornate.find((g) => g.leagueId === id))
    .filter((g): g is NonNullable<typeof g> => g !== undefined);
  const altre = giornate.filter((g) => !inFascia(g.leagueId));

  // Si apre un campionato solo: la scelta viaggia nell'indirizzo, e senza scelta vale il
  // primo della fascia. Le coperture si chiedono soltanto per le gare che si mostrano.
  const legaScelta = Number(scalare(parametri.lega));
  const scelta = fascia.find((g) => g.leagueId === legaScelta) ?? fascia[0] ?? null;
  const coperture = await coperturaDelleGare(scelta?.gare ?? []);

  const todayMatches = matchesResult.matches;

  // Sei righe: la prima nel riquadro protagonista, le altre cinque nell'elenco sotto.
  const sbilanci = medie === null
    ? []
    : sbilanciDelGiorno(predictionsResult.predictions, medie, 6);
  const primo = sbilanci[0];

  const available = matchesResult.source === "provider";

  return (
    <ProductShell activeSection="home">
      <div className="oggi-backdrop" aria-hidden="true" />

      <section className="home" aria-labelledby="home-title">
        {/* **Prima del primo dato non c'e' piu' niente da leggere.** C'erano tre blocchi -
            la firma con la data, il titolo grande, la legenda dello scarto - per 149 px e
            ventun parole, e su un telefono da 812 px erano un quinto della prima schermata
            spesa in cose che non sono la gara. Il titolo resta per chi legge con la voce,
            perche' una pagina senza intestazione non si naviga; smette di occupare spazio
            per chi legge con gli occhi. */}
        <h1 id="home-title" className="sr-only-heading">
          {headline(available, todayMatches.length)}
        </h1>
        {/* La legenda dello scarto e' scesa dentro «Come si legge questa pagina»: serviva a
            capire il numero, non a leggerlo, e chi apre l'app vuole la gara. Resta il caso
            in cui le medie non ci sono, perche' li' non e' una spiegazione ma un'assenza. */}
        {medie !== null ? null : (
          <p className="home-lede home-legenda">
            Le medie di lega non sono raggiungibili: senza, lo scarto non si calcola.
          </p>
        )}

        {/* **Le gare del giorno aprono la pagina.** Erano sotto il calendario e sotto un
            riquadro che ripeteva la prima: due forme per la stessa gara, e la risposta
            arrivava dopo due schermate. Qui sono righe, dalla piu' staccata in giu'. */}
        {sbilanci.length > 0 ? (
          <ol className="partite-rows">
            {sbilanci.map((r) => (
              <li key={r.eventId}>
                <Link className="partite-row" href={`/match/${r.eventId}`}>
                  <span className="partite-time">
                    {new Date(r.kickoff).toLocaleTimeString("it-IT", KICKOFF_TIME)}
                  </span>
                  <span className="partite-teams">
                    {r.homeTeam} contro {r.awayTeam}
                    {/* La media non si ripete riga per riga: sta dentro «Come si legge questa pagina», e
                        quale delle due valga lo dice l'esito a destra - Casa o Trasferta. */}
                    <span className="engine-obs">
                      {r.leagueName ?? "competizione non dichiarata"}
                    </span>
                  </span>
                  <span className="partite-read">
                    <b>{punti(r.scarto)}</b>
                    <i>{r.mercato} {Math.round(r.probabilita)}%</i>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        ) : null}

        <CalendarioGiornate
          fascia={fascia}
          scelta={scelta}
          altre={altre}
          coperture={coperture}
          giorni={GIORNI_AVANTI}
        />


        {medie === null ? (
          <p className="home-note">
            Le medie dei mercati si leggono dal livello dati di IQstatS, che qui non è
            raggiungibile: senza di quelle non si può dire quanto una lettura si stacchi, e
            una media inventata sarebbe peggio di nessuna classifica. Restano le sezioni.
          </p>
        ) : null}

        {/* **Le note stanno dietro un controllo, non nel flusso.** Erano tre paragrafi
            di fila, 122 parole senza un numero, sparsi fra i riquadri e il fondo: chi apre
            la dashboard vuole le gare, non le istruzioni. Restano intere, a un clic. */}
        <details className="dossier-spiega">
          <summary>Come si legge questa pagina</summary>
          <p className="home-note">
            Ogni riquadro apre una sezione. Quelli spenti non hanno ancora dati veri: restano
            visibili perché tu sappia dove sta andando il prodotto, non perché siano pronti.
          </p>
          <p className="home-note">
            {available
              ? "I conteggi sono quelli del giorno intero in ora italiana, riletti a ogni apertura della pagina. Le gare senza una lettura del modello restano contate fra le gare: la differenza fra i due numeri è la copertura, non un errore."
              : "L'elenco delle gare non è raggiungibile in questo momento. Le sezioni restano aperte, ma i riquadri non mostrano conteggi: un dato assente non diventa uno zero."}
            {matchesResult.truncated ? " Oggi l'elenco è così lungo da essere stato interrotto: i conteggi sono un minimo, non un totale." : null}
          </p>
          {primo === undefined ? null : (
            <p className="home-note">
              <b>Quello che questa classifica non sa dire.</b> Lo scarto misura quanto il
              modello si stacca dalla media, non quanto ci prende. Una misura di quanto una
              lettura regga fuori campione qui non c&apos;è: la fonte pubblica un campo
              «confidenza» che, misurato su 200 letture, è esattamente la probabilità del
              favorito, cioè lo stesso numero con un altro nome. L&apos;affidabilità vera esiste
              solo dentro il dossier di una gara, dove la calcola il nostro motore sui suoi
              sette bersagli.
            </p>
          )}
        </details>

      </section>
    </ProductShell>
  );
}
