import { TEAM_MINIMUM_SAMPLE } from "@iqstats/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LeagueIdentity, numericId } from "@/components/league-identity";
import { ProductShell } from "@/components/product-shell";
import { TeamCrest } from "@/components/team-crest";
import { TeamSplitsSection } from "@/components/team-splits-section";
import { TeamMetroSection } from "@/components/team-metro-section";
import { TeamRefereesSection } from "@/components/team-referees-section";
import { TeamSquadSection } from "@/components/team-squad-section";
import { VerifiedMediaImage } from "@/components/verified-media-image";
import { countryCode } from "@/server/iqstats/country-names";
import { metroDiLega } from "@/server/iqstats/team-metro";
import {
  getSeasons,
  getStandingRow,
  getTeamCoach,
  getTeamCompetitionOptions,
  getTeamProfile,
  getTeamRefereePanel,
  getTeamSplits,
  getTeamSquad,
  getTeamUpcoming,
  selectCompetition,
  type TeamCompetitionOption,
  type TeamSelection,
} from "@/server/iqstats/team-page";

type TeamPageProps = {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Gare concluse che la stagione corrente deve avere per prendere il posto della
 * precedente: il doppio del campione minimo, così casa e trasferta lo raggiungono
 * entrambe invece di mostrare un blocco vuoto alla prima giornata.
 */
const CURRENT_SEASON_THRESHOLD = TEAM_MINIMUM_SAMPLE * 2;

const kickoffFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

function formatKickoff(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "orario da definire";
  return kickoffFormatter.format(date).replace(",", " ·");
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function singleParam(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  return /^[1-9]\d*$/.test(value) ? value : null;
}

function competitionHref(teamId: string, option: TeamCompetitionOption): string {
  const query = new URLSearchParams({ leagueId: option.leagueId, seasonId: option.seasonId });
  return `/squadre/${teamId}?${query.toString()}`;
}

export async function generateMetadata({ params }: TeamPageProps): Promise<Metadata> {
  const { teamId } = await params;
  if (!/^[1-9]\d*$/.test(teamId)) return { title: "Scheda squadra" };
  const profile = await getTeamProfile(teamId);
  const name = profile?.data?.name;
  return {
    title: name ? `${name} · scheda squadra` : "Scheda squadra",
    description:
      "Rendimento, confronto casa e trasferta, prossime gare, rosa e allenatore, con fonte e campione dichiarati.",
  };
}

function EmptyPage({ title, message }: Readonly<{ title: string; message: string }>) {
  return (
    <ProductShell activeSection="teams">
      <div className="oggi-backdrop" aria-hidden="true" />
      <div className="dossier">
        <Link className="dossier-back" href="/partite">
          ← Partite
        </Link>
        <div className="oggi-empty">
          <h2>{title}</h2>
          <p>{message}</p>
        </div>
      </div>
    </ProductShell>
  );
}

function PanelSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <section className="dossier-panel squad-skeleton" aria-busy="true">
      <p className="dossier-kick">{label}</p>
      <p className="squad-section-note">
        Lettura delle gare in corso: il blocco compare appena il campione è completo.
      </p>
      <span className="squad-skeleton-bar" aria-hidden="true" />
      <span className="squad-skeleton-bar" aria-hidden="true" />
      <span className="squad-skeleton-bar" aria-hidden="true" />
    </section>
  );
}

async function SplitsBlock({
  teamId,
  selection,
  competitionLabel,
  teamName,
}: Readonly<{
  teamId: string;
  selection: TeamSelection;
  competitionLabel: string;
  teamName: string;
}>) {
  const envelope = await getTeamSplits(teamId, selection.leagueId, selection.seasonId);
  if (!envelope?.data) {
    return (
      <section className="dossier-panel">
        <p className="dossier-kick">Casa contro trasferta</p>
        <p className="squad-empty-inline">
          La fonte non ha risposto per questo blocco. Nessuna media viene ricostruita a memoria.
        </p>
      </section>
    );
  }
  // Il registro gare resta sul server: al client arrivano solo gli aggregati, il
  // dettaglio si scarica per la metrica che viene aperta.
  const { matchLog, ...splits } = envelope.data;
  void matchLog;
  return (
    <TeamSplitsSection
      splits={splits}
      availability={envelope.availability}
      competitionLabel={competitionLabel}
      teamName={teamName}
      teamId={teamId}
      leagueId={selection.leagueId}
      seasonId={selection.seasonId}
    />
  );
}

/**
 * Dove sta la squadra fra le altre del suo campionato, dalle nostre osservazioni.
 *
 * E' l'unico blocco della pagina che non legge dal provider: se la connessione al livello
 * dati non c'e', o la squadra non ha il campione minimo, non compare niente. Una sezione
 * appare solo quando il suo contratto dati c'e'.
 */
async function MetroBlock({
  teamSourceId,
  competitionSourceId,
  seasonSourceId,
  teamName,
}: Readonly<{
  teamSourceId: number;
  competitionSourceId: number;
  seasonSourceId: number;
  teamName: string;
}>) {
  const metro = await metroDiLega(teamSourceId, competitionSourceId, seasonSourceId);
  if (metro === null) return null;
  return <TeamMetroSection metro={metro} teamName={teamName} />;
}

async function SquadBlock({
  teamId,
  selection,
}: Readonly<{ teamId: string; selection: TeamSelection }>) {
  const envelope = await getTeamSquad(teamId, selection);
  if (!envelope?.data) {
    return (
      <section className="dossier-panel">
        <p className="dossier-kick">Rosa</p>
        <p className="squad-empty-inline">
          La fonte non ha risposto per la rosa. Nessun giocatore viene elencato senza dato reale.
        </p>
      </section>
    );
  }
  return (
    <TeamSquadSection
      squad={envelope.data}
      availability={envelope.availability}
      minimumSample={TEAM_MINIMUM_SAMPLE}
    />
  );
}

async function RefereesBlock({
  teamId,
  selection,
  competitionLabel,
  teamName,
}: Readonly<{
  teamId: string;
  selection: TeamSelection;
  competitionLabel: string;
  teamName: string;
}>) {
  const panel = await getTeamRefereePanel(teamId, selection);
  if (panel === null) {
    return (
      <section className="dossier-panel">
        <p className="dossier-kick">Arbitri</p>
        <p className="squad-empty-inline">
          La fonte non ha risposto per questo blocco. Nessuna designazione viene ricostruita.
        </p>
      </section>
    );
  }
  return (
    <TeamRefereesSection
      panel={panel}
      competitionLabel={competitionLabel}
      teamName={teamName}
    />
  );
}

async function CoachBlock({ teamId }: Readonly<{ teamId: string }>) {
  const envelope = await getTeamCoach(teamId);
  const coach = envelope?.data ?? null;

  return (
    <section className="dossier-panel" aria-labelledby="coach-title">
      <p className="dossier-kick">Allenatore</p>
      <h2 id="coach-title" className="squad-section-title">
        Chi la guida
      </h2>
      {coach === null ? (
        <p className="squad-empty-inline">
          Nessuna gara in programma da cui derivare l&apos;allenatore: il dato resta dichiarato
          assente invece di essere dedotto.
        </p>
      ) : (
        <>
          <p className="squad-coach-name">
            {coach.name}
            {coach.preferredFormation ? <em> · modulo {coach.preferredFormation}</em> : null}
          </p>
          <dl className="squad-facts">
            <div>
              <dt>Panchine</dt>
              <dd>{coach.matchesTotal ?? "n/d"}</dd>
            </div>
            <div>
              <dt>Vittorie</dt>
              <dd>{coach.winPct !== null ? `${coach.winPct.toFixed(1)}%` : "n/d"}</dd>
            </div>
            <div>
              <dt>Gol fatti a gara</dt>
              <dd>{coach.avgGoalsScored?.toFixed(2) ?? "n/d"}</dd>
            </div>
            <div>
              <dt>Gol subiti a gara</dt>
              <dd>{coach.avgGoalsConceded?.toFixed(2) ?? "n/d"}</dd>
            </div>
            <div>
              <dt>Possesso medio</dt>
              <dd>{coach.avgPossession !== null ? `${coach.avgPossession.toFixed(1)}%` : "n/d"}</dd>
            </div>
            <div>
              <dt>Porta inviolata</dt>
              <dd>{coach.cleanSheetPct !== null ? `${coach.cleanSheetPct.toFixed(1)}%` : "n/d"}</dd>
            </div>
          </dl>
          <p className="squad-section-note squad-section-note-tight">
            Derivato dalla prossima gara in programma
            {coach.derivedFromMatchId ? ` (gara ${coach.derivedFromMatchId})` : ""}, non dal campo
            &quot;squadra attuale&quot; del profilo, che la fonte può riportare diverso. Gli
            aggregati sono di carriera e appartengono alla fonte
            {coach.statsUpdatedAt ? `, aggiornati al ${coach.statsUpdatedAt.slice(0, 10)}` : ""}.
          </p>
        </>
      )}
    </section>
  );
}

export default async function TeamPage({ params, searchParams }: TeamPageProps) {
  const { teamId } = await params;
  if (!/^[1-9]\d*$/.test(teamId)) {
    return (
      <EmptyPage
        title="Identificativo squadra non valido"
        message="Il collegamento non è corretto. Torna alle partite per raggiungere una squadra dal dossier di una gara."
      />
    );
  }

  const query = await searchParams;
  const [profileEnvelope, options] = await Promise.all([
    getTeamProfile(teamId),
    getTeamCompetitionOptions(teamId),
  ]);
  const profile = profileEnvelope?.data ?? null;

  if (profile === null) {
    return (
      <EmptyPage
        title="Scheda squadra non disponibile"
        message="La fonte non espone questa squadra al momento. Nessun contenuto viene simulato."
      />
    );
  }

  // Le stagioni si risolvono per ogni competizione presente nei filtri: servono sia per
  // dare un nome leggibile, sia per sapere quale stagione la fonte dichiara corrente.
  const leagueIds = [...new Set(options.map((option) => option.leagueId))];
  const [seasonsByLeague, upcoming] = await Promise.all([
    Promise.all(
      leagueIds.map(async (leagueId) => [leagueId, await getSeasons(leagueId)] as const),
    ).then((entries) => new Map(entries)),
    getTeamUpcoming(teamId),
  ]);

  const currentSeasonByLeague = new Map(
    leagueIds.map((leagueId) => [
      leagueId,
      seasonsByLeague.get(leagueId)?.find((season) => season.current === true)?.id ?? null,
    ]),
  );

  const selected: TeamCompetitionOption | null = selectCompetition(
    options,
    { leagueId: singleParam(query.leagueId), seasonId: singleParam(query.seasonId) },
    { currentSeasonByLeague, currentSeasonThreshold: CURRENT_SEASON_THRESHOLD },
  );

  const standing = selected
    ? await getStandingRow(teamId, {
        leagueId: selected.leagueId,
        seasonId: selected.seasonId,
      })
    : null;

  const seasonNameOf = (option: TeamCompetitionOption): string | null =>
    seasonsByLeague.get(option.leagueId)?.find((season) => season.id === option.seasonId)?.name ??
    null;
  // Il nome stagione della fonte spesso contiene già la competizione ("Serie A 25/26"):
  // in quel caso non si ripete il nome della lega.
  const optionLabel = (option: TeamCompetitionOption): string => {
    const seasonName = seasonNameOf(option);
    if (seasonName === null) return option.leagueName;
    return seasonName.startsWith(option.leagueName)
      ? seasonName
      : `${option.leagueName} · ${seasonName}`;
  };

  const seasons = selected ? (seasonsByLeague.get(selected.leagueId) ?? null) : null;
  const currentSeason = seasons?.find((season) => season.current === true) ?? null;
  const currentSeasonMatches =
    currentSeason === null
      ? 0
      : (options.find(
          (option) =>
            option.leagueId === selected?.leagueId && option.seasonId === currentSeason.id,
        )?.matches ?? 0);
  const showingPreviousSeason =
    currentSeason !== null && selected !== null && selected.seasonId !== currentSeason.id;
  const competitionLabel = selected
    ? optionLabel(selected)
    : "nessuna competizione con gare concluse";

  return (
    <ProductShell activeSection="teams">
      <div className="oggi-backdrop" aria-hidden="true" />
      <div className="dossier squad-page">
        <Link className="dossier-back" href="/partite">
          ← Partite
        </Link>

        <article className="oggi-hero">
          <div className="oggi-hero-stadium" aria-hidden="true" />
          {profile.venue ? (
            <div
              className="oggi-hero-venue"
              style={{ backgroundImage: `url(/api/media/venue/${profile.venue.venueId})` }}
              aria-hidden="true"
            />
          ) : null}
          <div className="oggi-hero-scrim" aria-hidden="true" />
          <div className="oggi-hero-glow" aria-hidden="true" />
          <div className="oggi-hero-body">
            <p className="oggi-hero-comp">{competitionLabel}</p>
            <div className="oggi-hero-teams">
              <span className="oggi-team">
                <span className="oggi-crest">
                  <span className="oggi-crest-mono" aria-hidden="true">
                    {initials(profile.name)}
                  </span>
                  <VerifiedMediaImage
                    src={`/api/media/team/${profile.teamId}`}
                    className="oggi-crest-img"
                    width={46}
                    height={46}
                  />
                </span>
                <h1 className="oggi-team-name">{profile.name}</h1>
              </span>
            </div>
            <div className="oggi-hero-foot">
              {profile.venue ? (
                <span className="oggi-chip">
                  {profile.venue.name}
                  {profile.venue.city ? ` · ${profile.venue.city}` : ""}
                  {profile.venue.capacity !== null
                    ? ` · ${profile.venue.capacity.toLocaleString("it-IT")} posti`
                    : ""}
                </span>
              ) : (
                <span className="oggi-chip">Stadio non esposto dalla fonte</span>
              )}
              {profile.country ? <span className="oggi-prov">{profile.country}</span> : null}
            </div>
          </div>
        </article>

        {options.length > 1 ? (
          <nav className="squad-filters" aria-label="Competizione e stagione">
            <span className="squad-filters-label">Competizione</span>
            <ul>
              {options.map((option) => {
                const active =
                  selected?.leagueId === option.leagueId && selected.seasonId === option.seasonId;
                return (
                  <li key={`${option.leagueId}:${option.seasonId}`}>
                    <Link
                      href={competitionHref(teamId, option)}
                      aria-current={active ? "true" : undefined}
                      className={active ? "squad-filter is-active" : "squad-filter"}
                    >
                      <LeagueIdentity leagueId={numericId(option.leagueId)} name={optionLabel(option)} code={null} size="sm" />
                      <em>{option.matches === 1 ? "1 gara" : `${option.matches} gare`}</em>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        {showingPreviousSeason && currentSeason !== null ? (
          <p className="squad-notice">
            {currentSeasonMatches === 0
              ? `La stagione corrente (${currentSeason.name}) non ha ancora gare concluse.`
              : `La stagione corrente (${currentSeason.name}) ha ${currentSeasonMatches === 1 ? "una sola gara conclusa" : `solo ${currentSeasonMatches} gare concluse`}, sotto le ${CURRENT_SEASON_THRESHOLD} che servono perché casa e trasferta abbiano entrambe un campione minimo.`}{" "}
            I dati qui sotto sono di {competitionLabel} e non vengono mescolati con la nuova
            stagione. Diventerà lei il riferimento appena avrà gare a sufficienza, oppure
            selezionala subito dai filtri.
          </p>
        ) : null}

        <section className="dossier-panel" aria-labelledby="standing-title">
          <p className="dossier-kick">Rendimento</p>
          <h2 id="standing-title" className="squad-section-title">
            Dove sta in classifica
          </h2>
          {standing === null ? (
            <p className="squad-empty-inline">
              La fonte non espone una classifica per questa competizione: il blocco resta vuoto
              invece di mostrare posizioni ricostruite.
            </p>
          ) : (
            <dl className="squad-facts">
              <div>
                <dt>Posizione</dt>
                <dd>{standing.position}</dd>
              </div>
              <div>
                <dt>Punti</dt>
                <dd>{standing.points ?? "n/d"}</dd>
              </div>
              <div>
                <dt>Giocate</dt>
                <dd>{standing.played ?? "n/d"}</dd>
              </div>
              <div>
                <dt>V · N · P</dt>
                <dd>
                  {standing.won ?? "n/d"} · {standing.drawn ?? "n/d"} · {standing.lost ?? "n/d"}
                </dd>
              </div>
              <div>
                <dt>Gol fatti · subiti</dt>
                <dd>
                  {standing.goalsFor ?? "n/d"} · {standing.goalsAgainst ?? "n/d"}
                </dd>
              </div>
              <div>
                <dt>xG fatti · subiti</dt>
                <dd>
                  {standing.expectedGoalsFor?.toFixed(1) ?? "n/d"} ·{" "}
                  {standing.expectedGoalsAgainst?.toFixed(1) ?? "n/d"}
                </dd>
              </div>
              <div>
                <dt>Forma</dt>
                <dd>
                  {standing.compactForm.status === "available" ? standing.compactForm.value : "n/d"}
                </dd>
              </div>
            </dl>
          )}
        </section>

        {selected ? (
          <Suspense fallback={<PanelSkeleton label="Dove sta nel campionato" />}>
            <MetroBlock
              teamSourceId={Number(teamId)}
              competitionSourceId={Number(selected.leagueId)}
              seasonSourceId={Number(selected.seasonId)}
              teamName={profile.name}
            />
          </Suspense>
        ) : null}

        {selected ? (
          <Suspense fallback={<PanelSkeleton label="Casa contro trasferta" />}>
            <SplitsBlock
              teamId={teamId}
              selection={{ leagueId: selected.leagueId, seasonId: selected.seasonId }}
              competitionLabel={competitionLabel}
              teamName={profile.name}
            />
          </Suspense>
        ) : (
          <section className="dossier-panel">
            <p className="dossier-kick">Casa contro trasferta</p>
            <p className="squad-empty-inline">
              Nessuna gara conclusa disponibile per questa squadra: non c&apos;è campione da
              aggregare.
            </p>
          </section>
        )}

        <section className="dossier-panel" aria-labelledby="fixtures-title">
          <p className="dossier-kick">Prossime gare</p>
          <h2 id="fixtures-title" className="squad-section-title">
            Cosa la aspetta
          </h2>
          {upcoming === null || upcoming.length === 0 ? (
            <p className="squad-empty-inline">
              Nessuna gara in programma esposta dalla fonte in questa finestra.
            </p>
          ) : (
            <ul className="squad-fixture-list">
              {upcoming.map((match) => {
                const home = match.homeTeam.id === teamId;
                const opponent = home ? match.awayTeam : match.homeTeam;
                return (
                  <li key={match.id}>
                    <Link href={`/match/${match.id}`} className="squad-fixture">
                      <span className="squad-fixture-when">{formatKickoff(match.kickoffAt)}</span>
                      <span className="squad-fixture-who">
                        <b>
                          <TeamCrest name={opponent.name} teamId={numericId(opponent.id)} />
                          {opponent.name}
                        </b>
                        <em>
                          {home ? "in casa" : "in trasferta"} ·{" "}
                          <LeagueIdentity
                            leagueId={numericId(match.competition.id)}
                            name={match.competition.name}
                            code={countryCode(match.competition.country)}
                            size="sm"
                          />
                        </em>
                      </span>
                      <span className="squad-fixture-go" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {selected ? (
          <Suspense fallback={<PanelSkeleton label="Rosa" />}>
            <SquadBlock
              teamId={teamId}
              selection={{ leagueId: selected.leagueId, seasonId: selected.seasonId }}
            />
          </Suspense>
        ) : null}

        {selected ? (
          <Suspense fallback={<PanelSkeleton label="Arbitri" />}>
            <RefereesBlock
              teamId={teamId}
              selection={{ leagueId: selected.leagueId, seasonId: selected.seasonId }}
              competitionLabel={competitionLabel}
              teamName={profile.name}
            />
          </Suspense>
        ) : null}

        <CoachBlock teamId={teamId} />

        <section className="dossier-panel" aria-labelledby="method-title">
          <p className="dossier-kick">Metodo e fonti</p>
          <h2 id="method-title" className="squad-section-title">
            Da dove viene ogni numero
          </h2>
          <ul className="squad-method">
            <li>
              Tutti i dati sono letti soltanto lato server. Nessun valore è stimato, riempito o
              portato a zero.
            </li>
            <li>
              Casa e trasferta sono ricavate gara per gara dalle statistiche ufficiali della singola
              partita, mai da medie già confezionate.
            </li>
            <li>
              Il campionato mostrato è quello che pesa di più nello storico recente della squadra,
              non quello con la gara più recente: altrimenti in estate vincerebbero le amichevoli.
              Dentro quel campionato vale la stagione corrente appena raggiunge{" "}
              {CURRENT_SEASON_THRESHOLD} gare concluse; prima resta la precedente, dichiarata. Puoi
              sempre cambiare competizione e stagione dai filtri.
            </li>
            <li>
              Vengono aggregate tutte le gare concluse della stagione che la fonte espone in una
              pagina. Il numero di gare che compone ogni media è sempre scritto accanto al valore.
            </li>
            <li>
              Le statistiche di una gara conclusa non cambiano più: vengono lette una volta e
              riusate, così la stessa pagina non ripaga il costo a ogni visita.
            </li>
            <li>
              <b>Quanto può essere vecchio ciò che leggi.</b> La fonte non dichiara quando ha
              aggiornato profilo e rosa, quindi qui non si scrive un&apos;ora: si scrive per
              quanto una risposta viene riusata. Profilo squadra, rosa e allenatore restano
              validi <b>fino a 24 ore</b>; la classifica <b>fino a 10 minuti</b>; le prossime
              gare <b>fino a 5 minuti</b>. Un istante di lettura, qui, direbbe una precisione
              che non abbiamo.
            </li>
            <li>
              Le percentuali non sono medie di percentuali: sommano numeratori e denominatori di
              tutte le gare del campione.
            </li>
          </ul>
        </section>
      </div>
    </ProductShell>
  );
}
