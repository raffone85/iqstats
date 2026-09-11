import type { Metadata } from "next";
import Link from "next/link";

import { CalendarioGiornate } from "@/components/calendario-giornate";
import { ProductShell } from "@/components/product-shell";
import { coperturaDelleGare } from "@/server/iqstats/copertura";
import { prossimeGiornate } from "@/server/iqstats/giornate";
import { getMatchesByDate, getMatchesInRange } from "@/server/iqstats/matches";
import { VoceDiGara } from "@/components/expected-voce";
import { expectedDelleGare, type GaraExpected } from "@/server/iqstats/expected-famiglie";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "IQstatS",
  description:
    "Le sezioni di IQstatS in una sola pagina: gare di oggi, letture del modello, calendario, squadre e metodo.",
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

/**
 * Le gare del primo giorno che ne ha ancora da giocare, e come si chiama quel giorno.
 *
 * **Non sempre e' oggi, e quando non lo e' si scrive.** L'artefatto copre tre giornate, e
 * misurato l'11 settembre alle 20:30 le gare di oggi erano 7 con 5 ancora da giocare,
 * contro 83 di domani: passata l'ultima, una sezione che dicesse «Oggi» sopra un elenco
 * vuoto sarebbe peggio di una che dichiara il giorno che sta mostrando.
 */
function primoGiornoConGare(gare: readonly GaraExpected[]): {
  readonly titolo: string;
  readonly gare: readonly GaraExpected[];
} | null {
  const giorno = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const primo = gare[0];
  if (primo === undefined) return null;
  const chiave = giorno(primo.kickoff);
  const oggi = todayKey();
  const domani = giornoPiu(oggi, 1);
  const titolo = chiave === oggi ? "Oggi" : chiave === domani ? "Domani" : new Date(
    `${chiave}T12:00:00Z`,
  ).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  return { titolo, gare: gare.filter((g) => giorno(g.kickoff) === chiave) };
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
  const [matchesResult, finestra] = await Promise.all([
    getMatchesByDate(today),
    getMatchesInRange(today, fino),
  ]);
  // Le stesse righe di Expected, dallo stesso artefatto: una gara si legge con il criterio
  // del consigliato, che il consuntivo misura, e non con un secondo numero valido qui e
  // in nessun altro posto del prodotto.
  const expected = expectedDelleGare();
  const inArrivo = expected === null ? null : primoGiornoConGare(expected.gare);

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
        {/* **Le gare aprono la pagina, con la lettura del motore.** Prima qui c'era lo
            scarto sull'1x2 - sei gare, un numero che in tutto il resto del prodotto non
            ricompare - e per capirlo bisognava aprire «Come si legge questa pagina». Ora
            sono le righe di Expected: il consigliato di ogni gara, scelto dal criterio di
            cui il consuntivo conosce la resa. */}
        {inArrivo === null ? (
          <p className="home-note">
            Il calcolo offline non copre nessuna gara ancora da giocare. Le sezioni
            restano, e <Link href="/expected">Expected</Link> dice quando è stato scritto
            l&apos;ultimo.
          </p>
        ) : (
          <>
            <p className="home-lede home-legenda">
              <b>{inArrivo.titolo}</b> · {inArrivo.gare.length}{" "}
              {inArrivo.gare.length === 1 ? "gara da leggere" : "gare da leggere"} ·{" "}
              <Link href="/expected">tutte le gare in arrivo</Link>
            </p>
            <ol className="partite-rows">
              {inArrivo.gare.map((g) => <VoceDiGara key={g.gara} g={g} />)}
            </ol>
          </>
        )}

        <CalendarioGiornate
          fascia={fascia}
          scelta={scelta}
          altre={altre}
          coperture={coperture}
          giorni={GIORNI_AVANTI}
        />


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
        </details>

      </section>
    </ProductShell>
  );
}
