import type { Metadata } from "next";
import Link from "next/link";

import { LeagueIdentity } from "@/components/league-identity";
import { ProductShell } from "@/components/product-shell";
import { TeamCrest } from "@/components/team-crest";
import { competitionRank } from "@/server/iqstats/competition-rank";
import { getMatchesByDate, type MatchListItem } from "@/server/iqstats/matches";
import { getPredictionsByDate } from "@/server/iqstats/predictions";

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

/** Il giorno del prodotto è quello italiano, come il taglio usato per leggere le gare. */
function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Orario da definire";
  return "Oggi alle ".concat(date.toLocaleTimeString("it-IT", KICKOFF_TIME));
}

/** Contatore di sezione: dice quanto contenuto c'è ora, al singolare o al plurale. */
function counter(count: number, one: string, many: string) {
  return (
    <>
      {count} {count === 1 ? one : many}
    </>
  );
}

function headline(available: boolean, count: number) {
  if (!available) return "Le sezioni di IQstatS.";
  if (count === 0) return "Oggi non ci sono gare in programma.";
  if (count === 1) return <>Oggi c&apos;è una gara da leggere.</>;
  return <>Oggi ci sono {count} gare da leggere.</>;
}

/**
 * In evidenza va la gara che conta di più fra quelle ancora da giocare oggi: prima il peso
 * della competizione, poi l'orario. Con centocinquanta gare al giorno il solo ordine di
 * orario metterebbe quasi sempre un'amichevole in vetrina. Niente gare rinviate o concluse;
 * se il giorno è tutto alle spalle resta l'ultima gara giocabile.
 */
function featuredMatch(matches: readonly MatchListItem[]): MatchListItem | null {
  const playable = matches.filter(
    (m) => m.status !== "postponed" && m.status !== "cancelled" && m.status !== "finished",
  );
  const upcoming = playable.filter((m) => new Date(m.kickoff).getTime() > Date.now());
  const pool = upcoming.length > 0 ? upcoming : playable;

  return pool.reduce<MatchListItem | null>((best, m) => {
    if (best === null) return m;
    const rank = competitionRank(m.leagueId);
    const bestRank = competitionRank(best.leagueId);
    if (rank !== bestRank) return rank < bestRank ? m : best;
    return m.kickoff < best.kickoff ? m : best;
  }, null) ?? matches[matches.length - 1] ?? null;
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

export default async function HomePage() {
  const today = todayKey();
  // Gare e letture dello stesso giorno: due grandezze diverse, e il loro rapporto è la
  // copertura del modello. Un numero solo mentirebbe su una delle due.
  const [matchesResult, predictionsResult] = await Promise.all([
    getMatchesByDate(today),
    getPredictionsByDate(today),
  ]);

  const todayMatches = matchesResult.matches;
  const matchIds = new Set(todayMatches.map((m) => m.eventId));
  const readMatches = predictionsResult.predictions.filter((p) => matchIds.has(p.eventId)).length;

  const feature = featuredMatch(todayMatches);

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
          <span className="oggi-src">{new Date().toLocaleDateString("it-IT", LONG_DAY)}</span>
        </div>

        <h1 id="home-title" className="home-title">
          {headline(available, todayMatches.length)}
        </h1>
        <p className="home-lede">
          Ogni riquadro apre una sezione. Quelli spenti non hanno ancora dati veri: restano
          visibili perché tu sappia dove sta andando il prodotto, non perché siano pronti.
        </p>

        <div className="home-grid">
          {/* Riquadro protagonista: unico blocco ad alto contrasto, come la hero del sistema.
              Porta dritto al dossier della gara in evidenza, che è dove «si apre tutto»;
              se oggi non c'è una gara leggibile ripiega sul calendario. */}
          <Link
            className="home-tile home-tile-wide home-tile-feature"
            href={feature ? `/match/${feature.eventId}` : "/partite"}
          >
            <span className="home-tile-head">
              <span className="home-tile-name">{feature ? "La gara di oggi" : "Partite"}</span>
              <span className="home-tile-count">
                {!available
                  ? "non disponibile"
                  : todayMatches.length === 0
                    ? "nessuna oggi"
                    : counter(todayMatches.length, "gara", "gare")}
              </span>
            </span>
            <span className="home-tile-sub">
              {feature ? "Apri il dossier: gol, tiri, corner, falli, fuorigioco" : "Il calendario delle gare"}
            </span>

            <span className="home-feature">
              {feature ? (
                <>
                  <span className="home-feature-league">
                    <LeagueIdentity
                      leagueId={feature.leagueId}
                      name={feature.leagueName ?? "competizione non dichiarata"}
                      code={feature.leagueCountryCode}
                      size="sm"
                    />
                  </span>
                  <span className="home-feature-teams">
                    <TeamCrest name={feature.homeTeam} teamId={feature.homeTeamId} />
                    {feature.homeTeam}
                    <span className="home-feature-vs"> contro </span>
                    <TeamCrest name={feature.awayTeam} teamId={feature.awayTeamId} />
                    {feature.awayTeam}
                  </span>
                  <span className="home-feature-time">{formatWhen(feature.kickoff)}</span>
                </>
              ) : (
                <span className="home-feature-time">
                  Nessuna gara nell&apos;elenco corrente.
                </span>
              )}
            </span>

            <span className="home-tile-go" aria-hidden="true">
              Apri
            </span>
          </Link>

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

          <div className="home-tile home-tile-wide home-tile-soon">
            <span className="home-tile-head">
              <span className="home-tile-name">Expected</span>
              <span className="home-tile-count">in arrivo</span>
            </span>
            <span className="home-tile-sub">
              Due squadre qualsiasi e l&apos;arbitro che scegli tu, anche se non si incontrano:
              un banco di prova, non il dossier di una gara in calendario
            </span>
          </div>
        </div>

        <p className="home-note">
          {available
            ? "I conteggi sono quelli del giorno intero in ora italiana, riletti a ogni apertura della pagina. Le gare senza una lettura del modello restano contate fra le gare: la differenza fra i due numeri è la copertura, non un errore."
            : "L'elenco delle gare non è raggiungibile in questo momento. Le sezioni restano aperte, ma i riquadri non mostrano conteggi: un dato assente non diventa uno zero."}
          {matchesResult.truncated ? " Oggi l'elenco è così lungo da essere stato interrotto: i conteggi sono un minimo, non un totale." : null}
        </p>
      </section>
    </ProductShell>
  );
}
