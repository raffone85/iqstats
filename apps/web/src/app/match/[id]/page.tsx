import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LeagueIdentity } from "@/components/league-identity";
import { ProductShell } from "@/components/product-shell";
import { StatEngineSection } from "@/components/stat-engine-section";
import { VerifiedMediaImage } from "@/components/verified-media-image";
import {
  allenatoreDellaSquadra,
  idAllenatore,
  provenienzaInChiaro,
  type AllenatoreDellaSquadra,
} from "@/server/iqstats/allenatore";
import {
  getMatchDetail,
  getReferee,
  getVenue,
  type ManagerInfo,
  type MatchWeather,
} from "@/server/iqstats/match-context";
import { MatchFinishedSection } from "@/components/match-finished-section";
import { MatchGolSection } from "@/components/match-gol-section";
import { MatchLettureFortiSection } from "@/components/match-letture-forti";
import { FAMIGLIE, MatchProjectionSection } from "@/components/match-projection-section";
import { ArbitroScheda } from "@/components/arbitro-scheda";
import { MatchArbitroSection } from "@/components/match-arbitro-section";
import { MatchContestoSection } from "@/components/match-contesto-section";
import { MatchFormaSection } from "@/components/match-forma-section";
import { MatchRitardiSection } from "@/components/match-ritardi-section";
import { MatchStandingsSection } from "@/components/match-standings-section";
import {
  getFinishedMatchStats,
  getMatchIncidents,
} from "@/server/iqstats/match-finished";
import {
  getMatchStandingRows,
  getTeamForm,
} from "@/server/iqstats/team-page";
import { getMatchLineups, type TeamLineup } from "@/server/iqstats/lineups";
import { getLeaguesIndex } from "@/server/iqstats/matches";
import { buildMatchPicks, type PickArea } from "@/server/iqstats/match-picks";
import { getMatchOdds } from "@/server/iqstats/odds";
import { proiezioniDellaGara, type SenzaProiezione } from "@/server/iqstats/projection-runtime";
import { lettureForti } from "@/server/iqstats/projection/letture-forti";
import { bersagliConArbitroEntrato } from "@/server/iqstats/projection/match";
import { readMarket, readMatch } from "@/server/iqstats/match-reading";
import { getMatchPrediction } from "@/server/iqstats/predictions";
import { getStatEngineReading } from "@/server/iqstats/stat-engine";
import {
  gareDirette, giudizioSulMetro, medieDaMostrare, medieDelPeriodo, metriDiLega, metroPer,
  perStagioneCompetizione, profiloArbitro,
} from "@/server/iqstats/referees";

export const metadata: Metadata = {
  title: "Dossier gara",
  description: "Verdetto del modello, arbitro & stadio e testa a testa, con fonte dichiarata.",
};

type MatchPageProps = {
  params: Promise<{ id: string }>;
};

const kickoffFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

function formatKickoff(iso: string): string {
  if (!iso) return "orario da definire";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "orario da definire";
  return kickoffFormatter.format(date).replace(",", " ·");
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    notstarted: "Programmata",
    upcoming: "Programmata",
    inprogress: "In corso",
    live: "In corso",
    finished: "Conclusa",
    postponed: "Rinviata",
    cancelled: "Annullata",
  };
  return map[status] ?? "Stato non disponibile";
}

function Crest({ name, teamId, className }: { name: string; teamId: number | null; className: string }) {
  return (
    <span className={className}>
      <span className="oggi-crest-mono" aria-hidden="true">{initials(name)}</span>
      {teamId ? <VerifiedMediaImage src={`/api/media/team/${teamId}`} className="oggi-crest-img" width={46} height={46} /> : null}
    </span>
  );
}

/** Come si chiama, in pagina, ciascuna delle quattro letture. */
const PICK_AREA: Record<PickArea, string> = {
  esito: "Chi vince",
  gol: "I gol",
  gioco: "Il gioco",
  disciplina: "La disciplina",
};

/** Il tempo previsto arriva in inglese: si traduce solo ciò che sappiamo tradurre. */
const WEATHER_LABEL: Record<string, string> = {
  clear: "sereno",
  sunny: "soleggiato",
  cloudy: "nuvoloso",
  "partly cloudy": "poco nuvoloso",
  overcast: "coperto",
  rain: "pioggia",
  "light rain": "pioggia leggera",
  "heavy rain": "pioggia forte",
  drizzle: "pioggia leggera",
  snow: "neve",
  fog: "nebbia",
  mist: "foschia",
  thunderstorm: "temporale",
};

function weatherText(weather: MatchWeather | null): string | null {
  if (!weather) return null;
  const parts: string[] = [];
  const label = weather.description ? WEATHER_LABEL[weather.description.toLowerCase()] : undefined;
  if (label) parts.push(label);
  if (weather.temperatureC !== null) parts.push(String(Math.round(weather.temperatureC)).concat(" gradi"));
  // Il vento si nomina solo quando è abbastanza forte da contare in campo.
  if (weather.windSpeed !== null && weather.windSpeed >= 15) {
    parts.push(String(Math.round(weather.windSpeed)).concat(" km/h di vento"));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Il profilo tattico arriva in inglese: si traduce solo ciò che sappiamo tradurre. */
const TACTICAL_PROFILE: Record<string, string> = {
  balanced: "gioco equilibrato",
  attacking: "gioco offensivo",
  offensive: "gioco offensivo",
  defensive: "gioco difensivo",
  possession: "gioco di possesso",
  counter: "gioco di rimessa",
  "counter-attacking": "gioco di rimessa",
  pressing: "gioco di pressione",
};

/**
 * La panchina in prosa: come gioca la squadra di questo allenatore, con il campione
 * dichiarato. Nessuna frase se la fonte non dà le medie.
 */
function benchReading(manager: ManagerInfo): string | null {
  const parts: string[] = [];
  const profile = manager.tacticalProfile ? TACTICAL_PROFILE[manager.tacticalProfile] : undefined;
  if (profile) parts.push(profile);
  if (manager.avgPossession !== null) {
    parts.push("palla al piede il ".concat(String(Math.round(manager.avgPossession)), "% del tempo"));
  }
  if (manager.avgGoalsScored !== null && manager.avgGoalsConceded !== null) {
    parts.push(
      "segna ".concat(
        manager.avgGoalsScored.toFixed(1).replace(".", ","),
        " e subisce ",
        manager.avgGoalsConceded.toFixed(1).replace(".", ","),
        " gol a gara",
      ),
    );
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/** L'undici di un lato. La confidenza si mostra solo quando la formazione è una previsione. */
function Eleven({ side, teamName, confirmed }: { side: TeamLineup | null; teamName: string; confirmed: boolean }) {
  if (!side) {
    return (
      <div className="bench-card">
        <p className="bench-team">{teamName}</p>
        <p className="bench-empty">Formazione non disponibile per questa squadra.</p>
      </div>
    );
  }
  return (
    <div className="bench-card">
      <p className="bench-team">{side.teamName ?? teamName}</p>
      <p className="eleven-formation">
        {side.formation ?? "modulo non dichiarato"}
        {!confirmed && side.confidence !== null ? (
          <em>previsione affidabile al {Math.round(side.confidence * 100)}%</em>
        ) : null}
      </p>
      <ol className="eleven-list">
        {side.starters.map((p) => (
          <li key={p.id ?? p.name}>
            <span className="eleven-shirt">{p.shirt ?? "—"}</span>
            <span className="eleven-name">{p.name}</span>
            <span className="eleven-role">{p.position ?? ""}</span>
          </li>
        ))}
      </ol>
      {side.unavailable.length > 0 ? (
        <p className="bench-sample">Indisponibili: {side.unavailable.join(", ")}</p>
      ) : null}
    </div>
  );
}

function Bench({ allenatore, teamName }: { allenatore: AllenatoreDellaSquadra; teamName: string }) {
  if (allenatore.esito !== "trovato") {
    return (
      <div className="bench-card">
        <p className="bench-team">{teamName}</p>
        <p className="bench-empty">Panchina non dichiarata: {provenienzaInChiaro(allenatore)}.</p>
      </div>
    );
  }
  const manager = allenatore.profilo;
  const coachId = allenatore.id;
  if (!manager) {
    return (
      <div className="bench-card">
        <p className="bench-team">{teamName}</p>
        <p className="bench-empty">
          Allenatore {coachId} noto, profilo non esposto dalla fonte &middot;{" "}
          {provenienzaInChiaro(allenatore)}.
        </p>
      </div>
    );
  }
  const reading = benchReading(manager);
  return (
    <div className="bench-card">
      <p className="bench-team">{teamName}</p>
      <div className="bench-id">
        <span className="bench-photo">
          <span className="oggi-crest-mono" aria-hidden="true">{initials(manager.name)}</span>
          {coachId ? (
            <VerifiedMediaImage src={"/api/media/manager/".concat(String(coachId))} className="bench-photo-img" width={56} height={56} />
          ) : null}
        </span>
        <span className="bench-name">
          <strong>{manager.name}</strong>
          {manager.preferredFormation ? <em>modulo abituale {manager.preferredFormation}</em> : null}
        </span>
      </div>
      {reading ? <p className="bench-reading">{reading}</p> : null}
      <p className="bench-sample">Allenatore {provenienzaInChiaro(allenatore)}</p>
      {manager.matches !== null ? (
        <p className="bench-sample">
          Su {manager.matches} gare alla guida: {manager.wins ?? 0} vinte, {manager.draws ?? 0} pari,{" "}
          {manager.losses ?? 0} perse
          {manager.cleanSheetPct !== null ? <> · porta inviolata nel {Math.round(manager.cleanSheetPct)}%</> : null}
        </p>
      ) : null}
    </div>
  );
}

// Il nome squadra porta alla sua scheda quando la fonte espone l'identificativo.
function TeamName({ name, teamId }: { name: string; teamId: number | null }) {
  if (teamId === null) return <span className="oggi-team-name">{name}</span>;
  return (
    <Link className="oggi-team-name dossier-team-link" href={`/squadre/${teamId}`}>
      {name}
    </Link>
  );
}

/**
 * Perche' la proiezione non c'e', detto a chi guarda.
 *
 * Una sezione che sparisce senza una riga si legge come un guasto: e' successo, ed e' il
 * motivo per cui questa funzione esiste. I cinque casi sono i cinque punti in cui
 * `proiezioniDellaGara` si arrende, e ognuno dice una cosa diversa perche' lo e'.
 */
function percheSenzaProiezione(motivo: SenzaProiezione): string {
  switch (motivo) {
    case "senza-connessione":
      return "Il livello dati dei nostri modelli non e' raggiungibile in questo momento: "
        + "l'assenza e' nostra, non della gara.";
    case "senza-modelli":
      return "Nessun modello e' attualmente promosso a produzione: finche' non lo e', "
        + "questa sezione non mostra numeri invece di mostrarne di provvisori.";
    case "gara-sconosciuta":
      return "Questa gara non e' fra quelle che abbiamo raccolto: il suo campionato o la "
        + "sua stagione stanno fuori dalle 29 competizioni che osserviamo.";
    case "senza-copertura":
      return "Le due squadre non hanno ancora abbastanza gare osservate in questa stagione "
        + "perche' i modelli dicano qualcosa: la proiezione compare dalla quarta giornata "
        + "in poi, e prima di allora sarebbe una gara sola moltiplicata per un'altra.";
    case "errore":
      return "La proiezione non e' stata calcolata per un errore di lettura. Lo dichiariamo "
        + "invece di far sparire la sezione senza dire niente.";
  }
}

export default async function MatchPage({ params }: MatchPageProps) {
  const { id } = await params;

  // Un indirizzo malformato non e' una gara con un problema: e' un indirizzo che non
  // esiste, e va detto con lo stesso 404 di una gara assente invece che con un riquadro.
  if (!/^[1-9]\d*$/.test(id)) notFound();

  const eventId = Number(id);
  const esito = await getMatchDetail(eventId);

  // **Una gara che non esiste e una fonte muta meritano risposte opposte.** Prima erano la
  // stessa cosa: entrambe rendevano un riquadro con stato 200, e per un motore di ricerca
  // un indirizzo inventato era una pagina valida. Ora l'assenza e' un 404 vero; il guasto
  // passeggero resta 200, perche' rispondere 404 a una gara vera la fa sparire dagli indici
  // per un'indisponibilita' di un minuto.
  if (esito.stato === "assente") notFound();

  if (esito.stato === "non-leggibile") {
    return (
      <ProductShell>
        <div className="oggi-backdrop" aria-hidden="true" />
        <div className="dossier">
          <Link className="dossier-back" href="/partite">← Partite</Link>
          <div className="oggi-empty">
            <h2>Dossier non leggibile in questo momento</h2>
            <p>
              La gara esiste, ma la fonte non ne espone i dettagli adesso. Nessun contenuto
              viene simulato: riprova fra qualche minuto, oppure torna al calendario.
            </p>
          </div>
        </div>
      </ProductShell>
    );
  }

  const detail = esito.detail;

  // La fonte ammette dieci richieste al secondo per indirizzo: il dossier le spezza in
  // ondate da non più di sei. Prima ciò che regge la pagina, poi il contorno.
  const [prediction, odds, lineups] = await Promise.all([
    getMatchPrediction(eventId),
    getMatchOdds(eventId),
    getMatchLineups(eventId),
  ]);
  // L'indice delle competizioni sta nella seconda ondata e ha una cache lunga: a pagina
  // fredda porta il conto a nove, a pagina calda resta a otto.
  // **Gli allenatori non si fermano piu' a quello che l'evento dichiara.** Misurato il 27
  // agosto 2026: su 522 gare in calendario nei sette giorni successivi, la fonte non dice
  // l'allenatore di casa in 21 e quello ospite in 22. Dove tace si guarda la prossima gara
  // della squadra e poi la nostra ultima gara osservata, e la pagina scrive da dove viene.
  const [referee, venue, homeCoach, awayCoach, leagueIndex] = await Promise.all([
    detail.refereeId ? getReferee(detail.refereeId) : Promise.resolve(null),
    detail.venueId ? getVenue(detail.venueId) : Promise.resolve(null),
    allenatoreDellaSquadra(detail.homeTeamId, detail.homeCoachId),
    allenatoreDellaSquadra(detail.awayTeamId, detail.awayCoachId),
    getLeaguesIndex(),
  ]);
  const league = detail.leagueId === null ? undefined : leagueIndex.get(detail.leagueId);

  // Terza ondata: dove stanno le due squadre e come ci sono arrivate. Tre richieste, mai
  // in parallelo con le cinque di prima — il tetto è dieci al secondo per indirizzo.
  const [standings, homeForm, awayForm] = await Promise.all([
    detail.leagueId !== null &&
    detail.seasonId !== null &&
    detail.homeTeamId !== null &&
    detail.awayTeamId !== null
      ? getMatchStandingRows(
          String(detail.leagueId),
          String(detail.seasonId),
          String(detail.homeTeamId),
          String(detail.awayTeamId),
        )
      : Promise.resolve(null),
    detail.homeTeamId !== null ? getTeamForm(String(detail.homeTeamId)) : Promise.resolve(null),
    detail.awayTeamId !== null ? getTeamForm(String(detail.awayTeamId)) : Promise.resolve(null),
  ]);

  // Quarta ondata, e solo a gara conclusa: il tabellino con la mappa dei tiri dentro, e la
  // cronologia. Sono due richieste in tutto — le statistiche e la mappa arrivano insieme —
  // e su una gara ancora da giocare non partono affatto.
  const played = detail.status === "finished";
  const [finishedStats, incidents] = await Promise.all([
    played ? getFinishedMatchStats(eventId) : Promise.resolve(null),
    played ? getMatchIncidents(eventId) : Promise.resolve(null),
  ]);

  // Motore statistico: lettura sincrona dell'artefatto generato, nessuna chiamata al provider.
  const engineReading = getStatEngineReading({
    leagueId: detail.leagueId,
    homeTeamId: detail.homeTeamId,
    awayTeamId: detail.awayTeamId,
    refereeId: detail.refereeId,
  });

  // Motore di proiezione: legge il proprio livello dati, mai la fonte. Senza connessione
  // dichiarata risponde null e in pagina resta la lettura di ENG-1: i due pannelli non
  // convivono, perche' mostrerebbero due numeri diversi per la stessa cosa.
  // Al motore vanno gli allenatori risolti, non solo quelli che l'evento dichiarava: e' la
  // stessa regola che usa `/expected`, e senza di essa le sei feature `allenatore_*` di
  // gialli, fuorigioco, parate e corner restavano vuote su ogni gara senza allenatore.
  const esitoProiezione = await proiezioniDellaGara({
    ...detail,
    homeCoachId: idAllenatore(homeCoach),
    awayCoachId: idAllenatore(awayCoach),
  });
  // Si separano i due casi qui, una volta sola, cosi' il resto della pagina continua a
  // leggere `proiezioni` come prima e il motivo dell'assenza resta disponibile per dirlo.
  const proiezioni = typeof esitoProiezione === "string" ? null : esitoProiezione;
  const senzaProiezione = typeof esitoProiezione === "string" ? esitoProiezione : null;

  const marketReading = odds ? readMarket(prediction, odds, detail.homeTeam, detail.awayTeam) : null;
  const picks = buildMatchPicks(prediction, engineReading, odds, detail.homeTeam, detail.awayTeam);

  // La sintesi nasce solo da ciò che è già stato letto: nessun dato nuovo, nessuna frase
  // scritta a mano. Se non c'è niente da dire, il blocco non compare.
  const h2h = detail.headToHead;
  const overallReading = prediction ? readMatch(prediction, detail.homeTeam, detail.awayTeam) : null;
  const weakestLineup = lineups && !lineups.confirmed
    ? Math.min(lineups.home?.confidence ?? 1, lineups.away?.confidence ?? 1)
    : null;
  const brief = [
    overallReading
      ? [overallReading.headline, overallReading.goals].filter(Boolean).join(", ").concat(".")
      : null,
    marketReading?.sentence ?? null,
    marketReading?.movement ?? null,
    weakestLineup !== null && weakestLineup < 0.55
      ? "Le formazioni sono previste e su una delle due squadre la previsione è incerta."
      : null,
    h2h && h2h.totalMatches !== null && h2h.totalMatches > 0 && h2h.totalMatches < 4
      ? "I precedenti fra queste squadre sono pochi: contano poco."
      : null,
  ].filter((line): line is string => line !== null);

  const finished = detail.homeScore != null && detail.awayScore != null;
  // **In quali attesi l'arbitro è entrato davvero.** Sotto un ripiego il modello non gira,
  // quindi i suoi ingressi d'arbitro non li guarda nessuno: la sezione non può dire «è già
  // dentro il numero» se non è vero. La regola del ripiego resta quella del motore.
  const arbitroEntratoIn = bersagliConArbitroEntrato(proiezioni?.bersagli ?? [])
    .map((target) => FAMIGLIE[target]?.nome ?? target);
  // Il profilo del designato dalle **nostre** osservazioni, non dalle medie di carriera
  // che la fonte pubblica: e' la regola del piano, e qui vale doppio perche' questi stessi
  // numeri sono gia' fra gli ingressi del motore.
  const [arbitroNostro, arbitroGare] = detail.refereeId === null
    ? [null, [] as const]
    : await Promise.all([profiloArbitro(detail.refereeId), gareDirette(detail.refereeId)]);
  // La competizione e la stagione **di questa gara**, prese dalla gara piu' recente che
  // l'arbitro ha diretto qui: il confronto che serve al lettore del dossier e' con le altre
  // gare dello stesso torneo, non con tutta la sua storia.
  const arbitroQui = arbitroGare.find((g) => g.competitionSourceId === detail.leagueId) ?? null;
  const arbitroLega = arbitroQui?.competizione ?? null;
  // **Le due medie del banner, e da dove vengono.** La stagione in corso quando ha almeno
  // cinque gare, altrimenti tutto il nostro storico: in stagione corrente la mediana e' una
  // gara sola, e una media su una partita nel punto piu' visibile della pagina sarebbe la
  // cosa peggiore che possiamo scrivere. Quale delle due si stia leggendo si dice sempre.
  const arbitroBanner = medieDaMostrare(arbitroGare, detail.leagueId ?? null);
  // Da quando partono le nostre osservazioni su di lui: senza questo, «tutte le 22 gare che
  // gli abbiamo osservato» non dice su che arco di tempo si sta guardando.
  const arbitroDa = arbitroGare.at(-1)?.quando.slice(0, 4) ?? null;
  const arbitroRighe = perStagioneCompetizione(arbitroGare);
  const arbitroMetri = await metriDiLega(
    [...new Set(arbitroRighe.map((r) => r.competitionSourceId))]
      .filter((id): id is number => id !== null),
  );
  // **Il giudizio guarda questa lega, e le stesse gare del numero che gli sta sotto.**
  // Severo o permissivo non esiste in assoluto: esiste rispetto ai colleghi che fischiano lo
  // stesso torneo. E quando il banner ripiega, ripiega dentro la competizione, altrimenti
  // l'etichetta finirebbe sopra una media fatta anche di altre leghe - errore vero, visto in
  // pagina: «SEVERO» sopra 3,71 gialli contro 4,32 dei colleghi.
  const arbitroMetro = arbitroQui === null ? null
    : metroPer(arbitroMetri, arbitroQui.competitionSourceId, arbitroQui.seasonId);
  const arbitroGiudizio = arbitroBanner === null || arbitroBanner.provenienza === "tutte"
    ? null
    : giudizioSulMetro(
      arbitroBanner.gialli, arbitroMetro?.gialli ?? null, arbitroMetro?.dispersioneGialli ?? null,
    );
  const weatherLabel = weatherText(detail.weather);
  // L'ora italiana dell'ultima lettura delle formazioni: senza, «previste» non dice quanto
  // è vecchia la previsione.
  const lineupsUpdatedAt = (() => {
    if (!lineups?.updatedAt) return null;
    const moment = new Date(lineups.updatedAt);
    if (Number.isNaN(moment.getTime())) return null;
    return moment.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Rome",
    });
  })();

  // Favorito derivato dal massimo 1X2 (l'endpoint singolo può non esporre `favorite`).
  const verdictFav = prediction
    ? ([
        { key: "H" as const, name: detail.homeTeam, prob: prediction.probHome },
        { key: "D" as const, name: "Pareggio", prob: prediction.probDraw },
        { key: "A" as const, name: detail.awayTeam, prob: prediction.probAway },
      ]
        .filter((r): r is { key: "H" | "D" | "A"; name: string; prob: number } => r.prob != null)
        .reduce<{ key: "H" | "D" | "A"; name: string; prob: number } | null>(
          (best, r) => (best === null || r.prob > best.prob ? r : best),
          null,
        ))
    : null;

  return (
    <ProductShell>
      <div className="oggi-backdrop" aria-hidden="true" />
      <div className="dossier">
        <Link className="dossier-back" href="/partite">← Partite</Link>

        {/* Testata con sfondo stadio */}
        <article className="oggi-hero">
          <div className="oggi-hero-stadium" aria-hidden="true" />
          {detail.venueId ? (
            <div className="oggi-hero-venue" style={{ backgroundImage: `url(/api/media/venue/${detail.venueId})` }} aria-hidden="true" />
          ) : null}
          <div className="oggi-hero-scrim" aria-hidden="true" />
          <div className="oggi-hero-glow" aria-hidden="true" />
          <div className="oggi-hero-body">
            <p className="oggi-hero-comp">
              <LeagueIdentity
                leagueId={detail.leagueId}
                name={league?.name ?? detail.roundName ?? "Gara"}
                code={league?.countryCode ?? null}
                size="sm"
              />
              <span className="oggi-hero-when">
                {detail.roundName && league?.name ? detail.roundName.concat(" · ") : ""}
                {formatKickoff(detail.kickoff)} · {statusLabel(detail.status)}
              </span>
            </p>
            <div className="oggi-hero-teams">
              <span className="oggi-team">
                <Crest name={detail.homeTeam} teamId={detail.homeTeamId} className="oggi-crest" />
                <TeamName name={detail.homeTeam} teamId={detail.homeTeamId} />
              </span>
              <span className="oggi-vs">{finished ? `${detail.homeScore}–${detail.awayScore}` : "contro"}</span>
              <span className="oggi-team oggi-team-away">
                <TeamName name={detail.awayTeam} teamId={detail.awayTeamId} />
                <Crest name={detail.awayTeam} teamId={detail.awayTeamId} className="oggi-crest" />
              </span>
            </div>
            {/* L'arbitro nel banner, con le due medie che contano e il loro campione. La
                fonte non ha la foto dei direttori - risposta 404 su tutti gli arbitri
                provati, mentre per gli allenatori la stessa richiesta risponde 200 - quindi
                qui non c'e' nessun ritratto e nessun segnaposto al suo posto. */}
            {referee === null ? null : (
              <p className="oggi-hero-ref">
                <span className="oggi-hero-ref-who">
                  <span className="oggi-hero-ref-tag">Arbitro</span>
                  {/* Il nome apre la sua scheda: da li' si vedono tutte le gare che ha
                      diretto, una per una, con falli e cartellini di ciascuna. */}
                  {detail.refereeId === null ? referee.name : (
                    <Link className="oggi-hero-ref-link" href={`/arbitri/${detail.refereeId}`}>
                      {referee.name}
                    </Link>
                  )}
                  {arbitroGiudizio === null ? null : (
                    <b className={`ref-metro-voce is-${arbitroGiudizio.replace(" ", "-")}`}>
                      {arbitroGiudizio}
                    </b>
                  )}
                </span>
                {arbitroBanner === null || arbitroBanner.partite === 0 ? (
                  <span className="oggi-hero-ref-src">
                    di lui non abbiamo ancora nessuna gara osservata
                  </span>
                ) : (
                  <>
                    <span className="oggi-hero-ref-num">
                      {arbitroBanner.falli === null
                        ? "— falli"
                        : `${arbitroBanner.falli.toFixed(1).replace(".", ",")} falli`}
                      <i> · </i>
                      {arbitroBanner.gialli === null
                        ? "— gialli"
                        : `${arbitroBanner.gialli.toFixed(2).replace(".", ",")} gialli`}
                      <i> a partita</i>
                    </span>
                    {/* Una riga sola, e dice tre cose: contro chi si misura il numero, su
                        quante gare, e - quando la stagione non basta - da dove arriva. Due
                        righe separate ripetevano il campione. */}
                    <span className="oggi-hero-ref-src">
                      {arbitroMetro === null || arbitroLega === null
                        || arbitroBanner.provenienza === "tutte"
                        ? ""
                        : `contro ${arbitroMetro.gialli.toFixed(2).replace(".", ",")} dei `
                          + `colleghi in ${arbitroLega} · `}
                      {arbitroBanner.provenienza === "stagione"
                        ? `${arbitroBanner.partite} gare in questa stagione`
                        : arbitroBanner.provenienza === "competizione"
                          ? (arbitroBanner.partiteInStagione === 0
                            ? "in questa stagione non ha ancora diretto qui, quindi "
                            : `solo ${arbitroBanner.partiteInStagione} `
                              + `${arbitroBanner.partiteInStagione === 1 ? "gara" : "gare"} in `
                              + "questa stagione, quindi ")
                            + `media su tutte le ${arbitroBanner.partite} che ha diretto in `
                            + `${arbitroLega ?? "questa competizione"}`
                            + `${arbitroDa === null ? "" : ` dal ${arbitroDa}`}`
                          : `in questa competizione non lo abbiamo ancora visto: media sulle `
                            + `${arbitroBanner.partite} gare che gli abbiamo osservato altrove, `
                            + "e senza un metro di questa lega non diciamo che arbitro è"}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </article>

        {/* In breve: la gara detta in tre frasi, prima dei numeri */}
        {brief.length > 0 ? (
          <section className="dossier-panel dossier-brief" aria-labelledby="brief-title">
            <p className="dossier-kick">In breve</p>
            <h2 id="brief-title" className="sr-only-heading">Sintesi della gara</h2>
            <p className="brief-text">{brief.join(" ")}</p>
          </section>
        ) : null}

        {/* Verdetto prima */}
        <section className="dossier-panel" aria-labelledby="verdict-title">
          <p className="dossier-kick">Verdetto</p>
          <h2 id="verdict-title" className="sr-only-heading">Verdetto del modello</h2>
          {prediction ? (
            <>
              <p className="dossier-verdict-lead">
                {verdictFav
                  ? <><b>{verdictFav.name}</b> {verdictFav.key === "D" ? "esito più probabile" : "favorita"} al {Math.round(verdictFav.prob)}%</>
                  : "Nessun favorito netto dal modello"}
                {prediction.mostLikelyScore ? <> · risultato più probabile <b>{prediction.mostLikelyScore}</b></> : null}
              </p>
              <div className="dossier-1x2">
                {([
                  { key: "H", label: detail.homeTeam, prob: prediction.probHome },
                  { key: "D", label: "Pareggio", prob: prediction.probDraw },
                  { key: "A", label: detail.awayTeam, prob: prediction.probAway },
                ] as const).map((row) => (
                  <div key={row.key} className={`dossier-1x2-row${prediction.predicted === row.key ? " is-pick" : ""}`}>
                    <span className="dossier-1x2-label">{row.label}</span>
                    <span className="dossier-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round(row.prob ?? 0))}%` }} /></span>
                    <span className="dossier-1x2-val">{row.prob != null ? `${Math.round(row.prob)}%` : "n/d"}</span>
                  </div>
                ))}
              </div>
              <div className="dossier-chips">
                <span className="oggi-chip">Over 2.5 · {prediction.probOver25 != null ? `${Math.round(prediction.probOver25)}%` : "n/d"}</span>
                <span className="oggi-chip">Gol/Gol · {prediction.probBtts != null ? `${Math.round(prediction.probBtts)}%` : "n/d"}</span>
                {prediction.xgHome != null && prediction.xgAway != null ? (
                  <span className="oggi-chip">xG {prediction.xgHome.toFixed(1)} – {prediction.xgAway.toFixed(1)}</span>
                ) : null}
              </div>
              <p className="dossier-src">
                Lettura del modello · letture, non certezze
              </p>
            </>
          ) : (
            <p className="dossier-empty">Verdetto del modello non disponibile per questa gara.</p>
          )}
        </section>

        {/* La lettura IQstatS in quattro voci: due sugli esiti, due sulle statistiche */}
        {picks.length > 0 ? (
          <section className="dossier-panel" aria-labelledby="picks-title">
            <p className="dossier-kick">La lettura IQstatS</p>
            <h2 id="picks-title" className="sr-only-heading">Le letture della gara</h2>
            <ul className="picks-list">
              {picks.map((pick) => (
                <li className="pick-card" key={pick.area}>
                  <span className="pick-area">{PICK_AREA[pick.area]}</span>
                  <span className="pick-label">{pick.label}</span>
                  <span className="pick-prob">{Math.round(pick.probability)}%</span>
                  <span className="pick-bar" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, Math.round(pick.probability))}%` }} />
                  </span>
                  <span className="pick-note">
                    {pick.note}
                    {pick.marketProbability !== null ? (
                      <> · il mercato lo dà al {Math.round(pick.marketProbability)}%</>
                    ) : pick.marketQuoted ? null : (
                      <> · su questo esito non esiste un mercato con cui confrontarsi</>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {picks.length < 4 ? (
              <p className="dossier-src">
                {engineReading.available
                  ? "Le letture mancanti non compaiono: su questa gara non c'è abbastanza per dirle, e una lettura in bilico non è una lettura."
                  : "Le letture su gioco e disciplina non compaiono: questa competizione non ha una base calibrata da IQstatS. Nessun valore viene inventato."}
              </p>
            ) : null}
            <p className="dossier-src">
              Letture della stessa gara, non consigli: ognuna dichiara la probabilità che le
              assegniamo e, dove il mercato quota lo stesso esito, quanto gli assegna il mercato.
            </p>
          </section>
        ) : null}

        {/* Modello e mercato affiancati: nessun operatore nominato, nessun collegamento fuori */}
        {marketReading ? (
          <section className="dossier-panel" aria-labelledby="market-title">
            <p className="dossier-kick">Modello e mercato</p>
            <h2 id="market-title" className="sr-only-heading">Confronto con il mercato</h2>
            <p className="dossier-verdict-lead">{marketReading.sentence}</p>
            {marketReading.movement ? <p className="market-move">{marketReading.movement}</p> : null}
            <div className="market-table">
              <div className="market-head" aria-hidden="true">
                <span>Esito</span>
                <span>Modello</span>
                <span>Mercato</span>
                <span>Quota</span>
              </div>
              {marketReading.rows.map((r) => (
                <div className="market-row" key={r.label}>
                  <span className="market-label">{r.label}</span>
                  <span className="market-val">{r.model !== null ? <>{Math.round(r.model)}%</> : "—"}</span>
                  <span className="market-val">{r.market !== null ? <>{Math.round(r.market)}%</> : "—"}</span>
                  <span className="market-val market-odds">
                    {r.odds !== null ? r.odds.toFixed(2).replace(".", ",") : "—"}
                  </span>
                </div>
              ))}
            </div>
            <p className="dossier-src">
              Quota di consenso su {odds?.bookmakers ?? 0} operatori, riportata a somma cento per
              togliere il margine di chi quota. Nessun operatore viene nominato e non ci sono
              collegamenti esterni: qui il mercato è una misura, non una vetrina.
            </p>
          </section>
        ) : null}

        {/* Le letture piu' solide di tutta la gara, prima delle sette card: i numeri sono
            gli stessi che stanno sotto, messi in fila una volta sola invece che confrontati
            a mente. Ordinate per quanto reggono, non per percentuale. */}
        {proiezioni === null || proiezioni.bersagli.length === 0 ? null : (
          <MatchLettureFortiSection
            letture={lettureForti(proiezioni.bersagli)}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
          />
        )}

        {/* Gol: non passa dai modelli, quindi compare anche dove la proiezione non arriva */}
        {proiezioni?.gol ? (
          <MatchGolSection
            gol={proiezioni.gol}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
            ultima={proiezioni.ultimaOsservazione}
          />
        ) : proiezioni === null ? null : (
          // La sezione Gol poggia sui gol attesi osservati. Dove quella colonna non e'
          // riempita - la Nigeria Premier Football League ha 758 righe e zero
          // `expected_goals` - la sezione non puo' esistere, e va detto invece di lasciare
          // un buco fra le altre.
          <section className="dossier-panel" aria-labelledby="senza-gol-title">
            <p className="dossier-kick">Gol non disponibili</p>
            <h2 id="senza-gol-title" className="sr-only-heading">
              Perche&apos; i mercati dei gol non compaiono su questa gara
            </h2>
            <p className="dossier-src">
              I mercati dei gol poggiano sui <b>gol attesi osservati</b> nelle gare già giocate
              della stagione. In questa competizione quella colonna non è riempita, quindi non
              c&apos;è niente su cui costruirli: nessun numero viene stimato al loro posto.
            </p>
          </section>
        )}

        {/* Giocate statistiche: il motore di proiezione dove c'è, altrimenti ENG-1 */}
        {proiezioni === null || proiezioni.bersagli.length === 0 ? (
          <>
            {/* **Il silenzio si legge come un guasto.** Quando la proiezione non c'e', la
                pagina scriveva soltanto la lettura di ENG-1 e nessuno poteva sapere se il
                motore piu' preciso fosse assente per una ragione o per un difetto. */}
            <section className="dossier-panel" aria-labelledby="senza-proiezione-title">
              <p className="dossier-kick">Proiezione non disponibile</p>
              <h2 id="senza-proiezione-title" className="sr-only-heading">
                Perche&apos; la proiezione non compare su questa gara
              </h2>
              <p className="dossier-src">
                {senzaProiezione === null
                  ? "I modelli hanno risposto, ma su questa gara nessuno dei sette bersagli "
                    + "arriva a una previsione completa per entrambe le squadre: sotto si "
                    + "legge il motore di base, che chiede meno storia."
                  : percheSenzaProiezione(senzaProiezione)}
                {" "}Qui sotto resta la lettura del motore di base, che poggia su medie e non
                sui modelli.
              </p>
            </section>
            <StatEngineSection
              reading={engineReading}
              homeTeam={detail.homeTeam}
              awayTeam={detail.awayTeam}
            />
          </>
        ) : (
          <MatchProjectionSection
            proiezioni={proiezioni}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
          />
        )}

        {/* Dove stanno le due squadre: classifica della competizione e forma vera */}
        <MatchStandingsSection
          standings={standings}
          homeTeam={detail.homeTeam}
          awayTeam={detail.awayTeam}
          homeForm={homeForm}
          awayForm={awayForm}
        />

        {/* Quanto pesano quei risultati: reti fatte e subite contro il metro della
            competizione, dalle nostre osservazioni. Sta subito sotto la striscia perche'
            risponde alla stessa domanda con un'altra unita' di misura. */}
        {proiezioni?.forma ? (
          <MatchFormaSection
            casa={proiezioni.forma.casa}
            trasferta={proiezioni.forma.trasferta}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
          />
        ) : null}

        {/* L'arbitro con i nostri numeri, e la dichiarazione che e' gia' dentro la
            proiezione: 16 ingressi su 85 nel modello dei gialli. */}
        {arbitroNostro === null ? null : (
          <MatchArbitroSection
            profilo={arbitroNostro}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
            entratoNei={arbitroEntratoIn}
            scheda={arbitroGare.length === 0 ? null : (
              <ArbitroScheda
                nome={arbitroNostro.nome}
                carriera={referee === null ? null : {
                  gare: referee.careerGames,
                  gialli: referee.careerYellowCards,
                  rossi: referee.careerRedCards,
                }}
                righe={arbitroRighe}
                gareDirette={arbitroGare}
                medieLunghe={medieDelPeriodo(arbitroGare)}
                quiEOra={arbitroQui === null ? null : {
                  competizione: arbitroQui.competizione,
                  stagione: arbitroQui.stagione,
                  seasonId: arbitroQui.seasonId,
                }}
                daQuando={arbitroGare.at(-1)?.quando ?? null}
                metri={arbitroMetri}
              />
            )}
          />
        )}

        {/* Il contesto: le colonne che i modelli usano gia', finora invisibili in pagina. */}
        {proiezioni ? (
          <MatchContestoSection
            contesto={proiezioni.contesto}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
          />
        ) : null}

        {/* Da quanto non succede, con la quota storica accanto: stesse righe della forma,
            contate in un altro modo. */}
        {proiezioni ? (
          <MatchRitardiSection
            casa={proiezioni.ritardi.casa}
            trasferta={proiezioni.ritardi.trasferta}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
          />
        ) : null}

        {/* La gara giocata: il tabellino, la mappa dei tiri e la cronologia */}
        <MatchFinishedSection
          stats={finishedStats}
          incidents={incidents}
          homeTeam={detail.homeTeam}
          awayTeam={detail.awayTeam}
        />

        {/* Chi gioca: previsto o confermato, e la differenza si dice */}
        {lineups && (lineups.home || lineups.away) ? (
          <section className="dossier-panel" aria-labelledby="lineups-title">
            <p className="dossier-kick">Chi gioca</p>
            <h2 id="lineups-title" className="sr-only-heading">Formazioni</h2>
            <p className="dossier-verdict-lead">
              {lineups.confirmed
                ? "Formazioni ufficiali: sono gli undici scesi in campo."
                : "Formazioni previste, non ancora ufficiali: possono cambiare fino al fischio d'inizio."}
            </p>
            {/* Quando un dato cambia da un momento all'altro, l'ora dice quanto vale. */}
            {lineupsUpdatedAt ? (
              <p className="dossier-src">
                {lineups.confirmed ? "Ufficiali dalle " : "Ultimo aggiornamento delle "}
                {lineupsUpdatedAt}
                {lineups.confirmed ? "." : ", rilette ogni dieci minuti fino all'ufficialità."}
              </p>
            ) : null}
            <div className="bench-grid">
              <Eleven side={lineups.home} teamName={detail.homeTeam} confirmed={lineups.confirmed} />
              <Eleven side={lineups.away} teamName={detail.awayTeam} confirmed={lineups.confirmed} />
            </div>
          </section>
        ) : null}

        {/* Le due panchine */}
        {homeCoach.esito === "trovato" || awayCoach.esito === "trovato" ? (
          <section className="dossier-panel" aria-labelledby="bench-title">
            <p className="dossier-kick">Le due panchine</p>
            <h2 id="bench-title" className="sr-only-heading">Gli allenatori</h2>
            <div className="bench-grid">
              <Bench allenatore={homeCoach} teamName={detail.homeTeam} />
              <Bench allenatore={awayCoach} teamName={detail.awayTeam} />
            </div>
            <p className="dossier-src">
              Medie della gestione di ciascun allenatore, non della sola stagione in corso: il
              numero di gare è scritto accanto.
            </p>
          </section>
        ) : null}

        {/* Il contorno: chi arbitra, dove si gioca, con che tempo, dopo quanto viaggio */}
        <section className="dossier-panel" aria-labelledby="ref-venue-title">
          <p className="dossier-kick">Il contorno</p>
          <h2 id="ref-venue-title" className="sr-only-heading">Arbitro, stadio e condizioni</h2>
          <div className="dossier-facts">
            <div className="dossier-fact">
              <dt>Arbitro</dt>
              <dd>{referee ? referee.name : "Non designato / non disponibile"}</dd>
            </div>
            {/* **Qui NON ci sono le medie dell'arbitro**, e non è una dimenticanza.
                Misurato il 27 agosto: gli aggregati della fonte filtrati per competizione
                sono gli stessi delle nostre osservazioni dove abbiamo il campione — in
                Premier, su cinque gare, stesso numero di gare in quattro casi su cinque e
                scarto massimo 0,24 gialli — e sono una gara sola dove non ce l'abbiamo:
                nelle coppe la mediana è 1-2 gare per arbitro. Ridondanti dove reggono,
                rumore dove sarebbero l'unica cosa. Restano nella sezione dedicata, che
                dichiara campione e metro. La carriera invece la sa solo la fonte. */}
            {referee?.careerGames != null ? (
              <div className="dossier-fact">
                <dt>Carriera dell&apos;arbitro</dt>
                <dd>
                  {referee.careerGames.toLocaleString("it-IT")} gare
                  {referee.careerYellowCards != null
                    ? ` · ${referee.careerYellowCards.toLocaleString("it-IT")} gialli`
                    : ""}
                  {referee.careerRedCards != null
                    ? ` · ${referee.careerRedCards.toLocaleString("it-IT")} rossi`
                    : ""}
                </dd>
              </div>
            ) : null}
            <div className="dossier-fact">
              <dt>Stadio</dt>
              <dd>{venue ? venue.name : "Non disponibile"}</dd>
            </div>
            {venue ? (
              <div className="dossier-fact">
                <dt>Città</dt>
                <dd>{[venue.city, venue.country].filter(Boolean).join(", ") || "n/d"}{venue.capacity ? ` · ${venue.capacity.toLocaleString("it-IT")} posti` : ""}</dd>
              </div>
            ) : null}
            {weatherLabel ? (
              <div className="dossier-fact">
                <dt>Tempo previsto</dt>
                <dd>{weatherLabel}</dd>
              </div>
            ) : null}
            {detail.travelDistanceKm !== null ? (
              <div className="dossier-fact">
                <dt>Viaggio degli ospiti</dt>
                <dd>{detail.travelDistanceKm.toLocaleString("it-IT")} km</dd>
              </div>
            ) : null}
            {detail.isLocalDerby || detail.isNeutralGround ? (
              <div className="dossier-fact">
                <dt>Cornice</dt>
                <dd>
                  {[detail.isLocalDerby ? "derby cittadino" : null, detail.isNeutralGround ? "campo neutro" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
            ) : null}
          </div>
          {referee?.careerGames != null ? (
            <p className="dossier-src">
              La carriera è il totale dichiarato dalla fonte su tutte le competizioni che
              segue: dice da quanto quest&apos;arbitro dirige, <b>non</b> come fischia questa
              gara, e <b>non entra nella proiezione</b>. Il metro della competizione, il
              campione e lo sbilancio fra i due lati stanno più sopra, nella sezione
              dedicata, calcolati sulle nostre osservazioni.
            </p>
          ) : null}
        </section>

        {/* Testa a testa */}
        {h2h && h2h.totalMatches ? (
          <section className="dossier-panel" aria-labelledby="h2h-title">
            <p className="dossier-kick">Testa a testa</p>
            <h2 id="h2h-title" className="sr-only-heading">Precedenti</h2>
            <div className="dossier-h2h">
              <div className="dossier-h2h-stat"><strong>{h2h.homeWins ?? 0}</strong><span>Vittorie {detail.homeTeam}</span></div>
              <div className="dossier-h2h-stat"><strong>{h2h.draws ?? 0}</strong><span>Pareggi</span></div>
              <div className="dossier-h2h-stat"><strong>{h2h.awayWins ?? 0}</strong><span>Vittorie {detail.awayTeam}</span></div>
              <div className="dossier-h2h-stat"><strong>{h2h.avgTotalGoals != null ? h2h.avgTotalGoals.toFixed(1) : "n/d"}</strong><span>Gol medi</span></div>
            </div>
            {h2h.recent.length > 0 ? (
              <ul className="dossier-recent">
                {h2h.recent.slice(0, 5).map((m, i) => (
                  <li key={`${m.date ?? "d"}-${i}`}>
                    <span>{m.home ?? "—"} <b>{m.score ?? ""}</b> {m.away ?? "—"}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="dossier-src">Su {h2h.totalMatches} precedenti registrati dalla fonte.</p>
          </section>
        ) : null}

        <p className="dossier-note">
          Dati letti soltanto lato server. Le probabilità sono letture di un modello statistico, mai certezze; nessun consiglio finanziario.
        </p>
      </div>
    </ProductShell>
  );
}
