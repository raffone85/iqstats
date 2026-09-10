import type { Metadata } from "next";
import Link from "next/link";

import { CalendarioGiornate } from "@/components/calendario-giornate";
import { LeagueIdentity } from "@/components/league-identity";
import { ProductShell } from "@/components/product-shell";
import { TeamCrest } from "@/components/team-crest";
import { coperturaDelleGare } from "@/server/iqstats/copertura";
import { prossimeGiornate } from "@/server/iqstats/giornate";
import { getMatchesByDate, getMatchesInRange, type MatchListItem } from "@/server/iqstats/matches";
import { getPredictionsByDate } from "@/server/iqstats/predictions";
import { medieDiMercato, sbilanciDelGiorno, type Sbilancio } from "@/server/iqstats/sbilanci";

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

const LONG_DAY: Intl.DateTimeFormatOptions = {
  timeZone: "Europe/Rome",
  weekday: "long",
  day: "numeric",
  month: "long",
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

/** Contatore di sezione: dice quanto contenuto c'è ora, al singolare o al plurale. */
function counter(count: number, one: string, many: string) {
  return (
    <>
      {count} {count === 1 ? one : many}
    </>
  );
}

/**
 * Il titolo risponde, non conta.
 *
 * Chi apre l'app non si chiede quante gare ci sono: si chiede dove il modello stia dicendo
 * qualcosa. Il numero di gare resta, ma come contorno del nome della gara che si stacca di
 * piu'. Senza scarti - niente medie, niente pronostici - si torna a dire quello che c'e',
 * perche' promettere una risposta che non abbiamo e' peggio di dichiarare un elenco.
 */
function headline(available: boolean, count: number, primo: Sbilancio | undefined) {
  if (!available) return "Le sezioni di IQstatS.";
  if (count === 0) return "Oggi non ci sono gare in programma.";
  if (primo === undefined) {
    return count === 1
      ? <>Oggi c&apos;è una gara da leggere.</>
      : <>Oggi ci sono {count} gare da leggere.</>;
  }
  return (
    <>
      Oggi il modello si sbilancia di più su{" "}
      {primo.homeTeam} contro {primo.awayTeam}.
    </>
  );
}

/** La virgola al posto del punto, un decimale: e' la voce italiana dei numeri di questa pagina. */
function virgola(valore: number): string {
  return valore.toFixed(1).replace(".", ",");
}

/** Le cifre di uno scarto: un decimale, virgola, e il segno perche' e' una distanza con verso. */
function punti(valore: number): string {
  return "+".concat(valore.toFixed(1).replace(".", ","));
}

/** Una squadra entra nell'indice solo se la fonte ne ha dato l'identificativo. */
function collectTeams(matches: readonly MatchListItem[]) {
  const teams = new Map<number, string>();
  for (const match of matches) {
    if (match.homeTeamId !== null) teams.set(match.homeTeamId, match.homeTeam);
    if (match.awayTeamId !== null) teams.set(match.awayTeamId, match.awayTeam);
  }
  return [...teams].sort((a, b) => a[1].localeCompare(b[1], "it"));
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
  const matchIds = new Set(todayMatches.map((m) => m.eventId));
  const readMatches = predictionsResult.predictions.filter((p) => matchIds.has(p.eventId)).length;

  // Sei righe: la prima nel riquadro protagonista, le altre cinque nell'elenco sotto.
  const sbilanci = medie === null
    ? []
    : sbilanciDelGiorno(predictionsResult.predictions, medie, 6);
  const primo = sbilanci[0];

  const leagues = [
    ...new Map(
      todayMatches
        .filter((m) => m.leagueId !== null && m.leagueName)
        .map((m) => [
          m.leagueId as number,
          { name: m.leagueName as string, code: m.leagueCountryCode },
        ]),
    ),
  ].sort((a, b) => a[1].name.localeCompare(b[1].name, "it"));

  const teams = collectTeams(todayMatches);
  const available = matchesResult.source === "provider";

  return (
    <ProductShell activeSection="home">
      <div className="oggi-backdrop" aria-hidden="true" />

      <section className="home" aria-labelledby="home-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">IQstatS</span>
          <span className="oggi-line" aria-hidden="true" />
          <span className="oggi-src">
            {new Date().toLocaleDateString("it-IT", LONG_DAY)}
            {matchesResult.lettoIl
              ? ` · letto alle ${new Date(matchesResult.lettoIl).toLocaleTimeString("it-IT", KICKOFF_TIME)}`
              : ""}
          </span>
        </div>

        <h1 id="home-title" className="home-title">
          {headline(available, todayMatches.length, primo)}
        </h1>
        <p className="home-lede">
          {primo === undefined || medie === null ? (
            <>
              Ogni riquadro apre una sezione. Quelli spenti non hanno ancora dati veri: restano
              visibili perché tu sappia dove sta andando il prodotto, non perché siano pronti.
            </>
          ) : (
            <>
              <b>Non è la percentuale più alta, è la più staccata dalla media.</b> La squadra
              di casa vince il {virgola(medie.casa)}% delle volte, quella in trasferta il{" "}
              {virgola(medie.trasferta)}%: «Casa al 54%» dice meno di «Trasferta al 45%»,
              anche se il numero è più grande. Le medie sono nostre, misurate su{" "}
              {medie.gare.toLocaleString("it-IT")} gare degli ultimi 365 giorni.
            </>
          )}
        </p>

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
                    <span className="engine-obs">
                      {r.leagueName ?? "competizione non dichiarata"} · media di questo esito{" "}
                      {virgola(r.media)}%
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

        <div className="home-grid">
          <Link className="home-tile" href="/pronostici">
            <span className="home-tile-head">
              <span className="home-tile-name">Pronostici</span>
              <span className="home-tile-count">
                {available ? <>{readMatches} su {todayMatches.length}</> : "—"}
              </span>
            </span>
            {/* Il rapporto è la copertura del modello: non tutte le gare hanno una lettura. */}
            <span className="home-tile-sub">
              {available
                ? "Gare di oggi con una lettura del modello"
                : "Le letture del modello, filtrabili"}
            </span>
            <span className="home-chips">
              <span className="home-chip">Esito favorito</span>
              <span className="home-chip">Over 2.5</span>
              <span className="home-chip">Gol/Gol</span>
            </span>
            <span className="home-tile-go" aria-hidden="true">
              Apri
            </span>
          </Link>

          <Link className="home-tile" href="/partite">
            <span className="home-tile-head">
              <span className="home-tile-name">Partite</span>
              <span className="home-tile-count">
                {available ? counter(leagues.length, "competizione", "competizioni") : "—"}
              </span>
            </span>
            <span className="home-tile-sub">
              {available ? (
                <>{todayMatches.length} gare oggi, calendario e ricerca per giorno</>
              ) : (
                "Calendario e ricerca per giorno"
              )}
            </span>
            <span className="home-chips">
              {leagues.slice(0, 3).map((league) => (
                <span className="home-chip" key={league[0]}>
                  <LeagueIdentity
                    leagueId={league[0]}
                    name={league[1].name}
                    code={league[1].code}
                    size="sm"
                  />
                </span>
              ))}
              {leagues.length === 0 ? <span className="home-chip">Nessuna competizione</span> : null}
            </span>
            <span className="home-tile-go" aria-hidden="true">
              Apri
            </span>
          </Link>

          {/* Le squadre non hanno un indice proprio: qui l'indice sono le gare già scaricate. */}
          <section className="home-tile home-tile-wide home-tile-index" aria-labelledby="home-teams">
            <span className="home-tile-head">
              <span className="home-tile-name" id="home-teams">
                Squadre
              </span>
              <span className="home-tile-count">
                {available ? counter(teams.length, "in campo", "in campo") : "—"}
              </span>
            </span>
            <span className="home-tile-sub">
              Scheda completa: medie, casa e trasferta, registro gara per gara, arbitri
            </span>
            <span className="home-teamlist">
              {teams.slice(0, 10).map((team) => (
                <Link className="home-team" key={team[0]} href={"/squadre/" + team[0]}>
                  <TeamCrest name={team[1]} teamId={team[0]} />
                  {team[1]}
                </Link>
              ))}
              {teams.length === 0 ? (
                <span className="home-tile-sub">Nessuna squadra nell&apos;elenco corrente.</span>
              ) : null}
            </span>
          </section>

          <Link className="home-tile" href="/metodo">
            <span className="home-tile-head">
              <span className="home-tile-name">Metodo</span>
              <span className="home-tile-count">guida</span>
            </span>
            <span className="home-tile-sub">Come si leggono i dati e cosa manca</span>
            <span className="home-tile-go" aria-hidden="true">
              Apri
            </span>
          </Link>

          <Link className="home-tile" href="/account/billing">
            <span className="home-tile-head">
              <span className="home-tile-name">Piani</span>
              <span className="home-tile-count">4 livelli</span>
            </span>
            <span className="home-tile-sub">Cosa include il tuo accesso</span>
            <span className="home-tile-go" aria-hidden="true">
              Apri
            </span>
          </Link>

          <div className="home-tile home-tile-soon">
            <span className="home-tile-head">
              <span className="home-tile-name">Giocatori</span>
              <span className="home-tile-count">in arrivo</span>
            </span>
            <span className="home-tile-sub">
              Rendimento per giocatore su più gare, con il campione dichiarato
            </span>
          </div>

          <Link className="home-tile" href="/arbitri">
            <span className="home-tile-head">
              <span className="home-tile-name">Arbitri</span>
              <span className="home-tile-count">681 direttori</span>
            </span>
            <span className="home-tile-sub">
              Falli e cartellini di ogni direttore, con il metro della competizione accanto
            </span>
            <span className="home-tile-go" aria-hidden="true">
              Apri
            </span>
          </Link>

          <Link className="home-tile home-tile-wide" href="/expected">
            <span className="home-tile-head">
              <span className="home-tile-name">Expected</span>
              <span className="home-tile-count">banco di prova</span>
            </span>
            <span className="home-tile-sub">
              Due squadre qualsiasi e l&apos;arbitro che scegli tu, anche se non si incontrano:
              un banco di prova, non il dossier di una gara in calendario
            </span>
            <span className="home-tile-go" aria-hidden="true">
              Apri
            </span>
          </Link>
        </div>

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
