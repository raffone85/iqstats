import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AggiornamentoLive } from "@/components/aggiornamento-live";
import { LeagueIdentity } from "@/components/league-identity";
import { ProductShell } from "@/components/product-shell";
import { SezioneRiservata } from "@/components/sezione-riservata";
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
import { MatchInsightSection, insightHaContenuto } from "@/components/match-insight-section";
import { FAMIGLIE, MatchProjectionSection } from "@/components/match-projection-section";
import { ArbitroScheda } from "@/components/arbitro-scheda";
import { MatchArbitroSection } from "@/components/match-arbitro-section";
import { MatchFormaSection } from "@/components/match-forma-section";
import { MatchRitardiSection } from "@/components/match-ritardi-section";
import { DossierCapitoli, DossierCapitolo } from "@/components/dossier-capitoli";
import { ComeSiAffrontano } from "@/components/come-si-affrontano";
import { contestoDiGara } from "@/server/iqstats/contesto-gara";
import { AnalisiFinale } from "@/components/analisi-finale";
import { analisiFinale } from "@/server/iqstats/analisi-finale";
import { readFeatureDecision } from "@/server/auth/authorization";
import { avvisoSenzaArbitro } from "@/server/iqstats/designazione";
import { cappelloDi, comeSiAffrontano } from "@/server/iqstats/affronto";
import {
  contese, duelliDiLato, medieDiLato, saltiDelTrend, trendUltime5,
} from "@/server/iqstats/lati";
import { ConteseSection } from "@/components/contese-section";
import { VerificaSection } from "@/components/verifica-section";
import {
  realeDellaGara, taraturaDegliIntervalli, verificaDellaGara,
} from "@/server/iqstats/verifica";
import { TrendRecente } from "@/components/trend-recente";

/**
 * Le aree del dossier, nell'ordine in cui si incontrano scorrendo.
 *
 * **Un'area e' una domanda dell'utente, non un elenco di funzioni.** «Chi puo' segnare» e
 * «chi rischia il cartellino» non sono due aree: sono due moduli dentro Giocatori. Una
 * funzione nuova entra nell'area che risponde alla sua domanda, e diventa un'area nuova solo
 * se porta una domanda che nessuna delle nove pone gia'.
 *
 * Ogni area entra nell'indice **solo se ha contenuto visibile su questa gara**: l'indice non
 * promette mai un capitolo che non si trova, e non promette nemmeno un capitolo che il piano
 * dell'utente non gli fa vedere.
 */
type AreeDelDossier = Readonly<Record<
  "giocata" | "insight" | "mercati" | "gol" | "proiezioni" | "trend" | "contesto"
  | "giocatori" | "arbitro" | "precedenti",
  boolean
>>;

function capitoliDi(aree: AreeDelDossier): readonly { id: string; nome: string }[] {
  const tutte = [
    { id: "cap-giocata", nome: "Gara giocata", c: aree.giocata },
    { id: "cap-insight", nome: "Insight", c: aree.insight },
    { id: "cap-mercati", nome: "Mercati", c: aree.mercati },
    { id: "cap-gol", nome: "Gol", c: aree.gol },
    { id: "cap-proiezioni", nome: "Proiezioni", c: aree.proiezioni },
    { id: "cap-trend", nome: "Trend", c: aree.trend },
    { id: "cap-contesto", nome: "Contesto", c: aree.contesto },
    { id: "cap-giocatori", nome: "Giocatori", c: aree.giocatori },
    { id: "cap-arbitro", nome: "Arbitro", c: aree.arbitro },
    { id: "cap-precedenti", nome: "Precedenti", c: aree.precedenti },
  ];
  return tutte.filter((a) => a.c).map(({ id, nome }) => ({ id, nome }));
}
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
import { haTabellaDiBase, isRuolo, letturaGiocatori } from "@/server/iqstats/giocatori-lettura";
import { MatchGiocatoriSection } from "@/components/match-giocatori-section";
import { getLeaguesIndex, MATCHES_TTL_MS } from "@/server/iqstats/matches";
import { getMatchOdds } from "@/server/iqstats/odds";
import { proiezioniDellaGara, type SenzaProiezione } from "@/server/iqstats/projection-runtime";
import { candidateDiGara, ordinaLetture } from "@/server/iqstats/projection/letture-forti";
import { baseDiLega } from "@/server/iqstats/base-di-lega";
import { bersagliConArbitroEntrato } from "@/server/iqstats/projection/match";
import { readMarket, readMatch } from "@/server/iqstats/match-reading";
import { buildMatchPicks, comparabileDaGol } from "@/server/iqstats/match-picks";
import { MatchValoreSection } from "@/components/match-valore-section";
import { matchIntelligence } from "@/server/iqstats/match-intelligence";
import { tempiDellaGara } from "@/server/iqstats/tempi";
import { MatchTempiSection } from "@/components/match-tempi-section";
import { ritmoDellaGara } from "@/server/iqstats/ritmo";
import { MatchRitmoSection } from "@/components/match-ritmo-section";
import { getMatchPrediction } from "@/server/iqstats/predictions";
import { getStatEngineReading } from "@/server/iqstats/stat-engine";
import {
  arbitroControLeSquadre, gareDirette, giudizioSulMetro, medieDaMostrare, medieDelPeriodo,
  metriDiLega, metroPer, perStagioneCompetizione, profiloArbitro,
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

  // **Il confine commerciale, deciso il 30 agosto 2026.** Il dato della gara resta libero
  // - chi gioca, classifica, forma, precedenti, panchine, contorno - e si paga la lettura
  // che ci mettiamo sopra. Due chiamate e non dieci: i due gruppi si accendono interi, e
  // dieci controlli che rispondono sempre insieme sono un controllo scritto dieci volte.
  const [insight, motore] = await Promise.all([
    readFeatureDecision("match.statistics.read"),
    readFeatureDecision("engine.read"),
  ]);
  const senzaAccount = !insight.allowed && insight.code === "unauthenticated";

  // **Il modello del confronto e' il nostro, quando c'e'.** Fino al 2 settembre 2026 la
  // colonna «Modello» del pannello del mercato veniva dalla previsione della fonte: un
  // numero altrui accostato al mercato altrui. I mercati dei gol escono dai nostri attesi
  // e hanno le stesse cinque voci, quindi entrano nello stesso confronto senza riscriverlo.
  // Dove il motore non copre la gara si ripiega sulla previsione della fonte, e la pagina
  // lo dichiara sotto la tabella.
  const modelloDeiGol = proiezioni?.gol ? comparabileDaGol(proiezioni.gol.mercati) : null;
  const confronto = modelloDeiGol ?? prediction;
  const marketReading = odds ? readMarket(confronto, odds, detail.homeTeam, detail.awayTeam) : null;
  // Il campione dei gol: il lato con meno storia fra i due, che e' quello che comanda.
  const campioneGol = proiezioni?.gol
    ? Math.min(proiezioni.gol.campioneCasa, proiezioni.gol.campioneTrasferta)
    : null;
  // **Il Value Engine, collegato.** Le regole di scelta stanno dove stavano; qui si porta
  // soltanto la stessa gara che la pagina sta gia' mostrando: i nostri gol, i bersagli del
  // motore quando ci sono, le quote gia' scaricate. Nessuna chiamata nuova alla fonte.
  // **I due tempi e il ritmo, dal nostro livello dati.** Due interrogazioni in parallelo,
  // nessuna chiamata nuova alla fonte: leggono le stesse tavole gia' aperte per il motore e
  // per gli arbitri, con la stessa finestra `kickoff_at <` che il motore usa ovunque.
  const [tempi, ritmo] = await Promise.all([
    tempiDellaGara({
      leagueId: detail.leagueId,
      seasonId: detail.seasonId,
      homeTeamId: detail.homeTeamId,
      awayTeamId: detail.awayTeamId,
      homeTeam: detail.homeTeam,
      awayTeam: detail.awayTeam,
      kickoffAt: detail.kickoff,
    }),
    ritmoDellaGara({
      leagueId: detail.leagueId,
      seasonId: detail.seasonId,
      homeTeamId: detail.homeTeamId,
      awayTeamId: detail.awayTeamId,
      kickoffAt: detail.kickoff,
    }),
  ]);
  const picks = buildMatchPicks(
    confronto,
    engineReading,
    odds,
    detail.homeTeam,
    detail.awayTeam,
    proiezioni?.bersagli ?? [],
    campioneGol,
  );
  // **Il dossier non calcola niente di nuovo**: conta quante letture indipendenti dicono la
  // stessa cosa, fra quelle che le sezioni sotto mostrano gia' una per una.
  const dossier = matchIntelligence({
    tempi,
    bersagli: proiezioni?.bersagli ?? [],
    nomiBersagli: Object.fromEntries(
      Object.entries(FAMIGLIE).map(([target, famiglia]) => [target, famiglia.nome]),
    ),
    picks,
  });

  // **I due lati che si giocheranno davvero**, letti dalle nostre righe: la casa dal suo
  // lato di casa, la trasferta dal suo di trasferta. Chiedere entrambi i lati a entrambe le
  // squadre direbbe un'altra cosa, e mediarli direbbe il falso: i livelli dei due lati sono
  // diversi. Senza uno dei tre identificativi non c'e' torneo da cui prendere il metro.
  const [latoCasa, latoFuori] = detail.homeTeamId === null || detail.awayTeamId === null
    || detail.leagueId === null || detail.seasonId === null
    ? [null, null]
    : await Promise.all([
      medieDiLato(detail.homeTeamId, detail.leagueId, detail.seasonId, "home"),
      medieDiLato(detail.awayTeamId, detail.leagueId, detail.seasonId, "away"),
    ]);
  // **Come stanno arrivando.** Le ultime cinque gare giocate davvero, casa e trasferta
  // insieme - la definizione scelta dall'utente il 29 agosto 2026, la stessa del prodotto di
  // riferimento - contro le medie del lato che si giochera' qui. Passa solo cio' che supera
  // l'errore delle due medie: con cinque gare, sotto quella soglia un salto non si distingue
  // da un'oscillazione.
  const [trendCasa, trendFuori] = detail.homeTeamId === null || detail.awayTeamId === null
    || detail.leagueId === null || detail.seasonId === null
    ? [null, null]
    : await Promise.all([
      trendUltime5(detail.homeTeamId, detail.leagueId, detail.seasonId),
      trendUltime5(detail.awayTeamId, detail.leagueId, detail.seasonId),
    ]);
  // **Chi vince il confronto, gara per gara.** La media non lo dice: due squadre con la
  // stessa media possono arrivarci vincendo sempre di poco o alternando gare estreme.
  const [duelliCasa, duelliFuori] = detail.homeTeamId === null || detail.awayTeamId === null
    || detail.leagueId === null || detail.seasonId === null
    ? [null, null]
    : await Promise.all([
      duelliDiLato(detail.homeTeamId, detail.leagueId, detail.seasonId, "home"),
      duelliDiLato(detail.awayTeamId, detail.leagueId, detail.seasonId, "away"),
    ]);
  const leContese = contese(duelliCasa, duelliFuori);

  // **A gara finita, quello che avevamo detto contro quello che e' successo.** Non e' una
  // pagella scritta dopo: il motore legge soltanto cio' che esisteva prima del calcio
  // d'inizio - e mai la gara stessa - quindi questa e' la previsione che la pagina mostrava
  // prima che si giocasse. Il reale viene dalle nostre osservazioni, non dal tabellone della
  // fonte: le colonne che il motore prevede si chiamano gia' come le nostre.
  const reale = played ? await realeDellaGara(eventId) : null;
  const verifica = verificaDellaGara(proiezioni?.bersagli ?? [], reale);
  // Il metro con cui leggere il conto: quanto quegli intervalli coprono davvero, misurato
  // fuori campione all'addestramento e non qui.
  const taratura = verifica === null ? null : taraturaDegliIntervalli();

  const saltiCasa = saltiDelTrend(latoCasa, trendCasa);
  const saltiFuori = saltiDelTrend(latoFuori, trendFuori);

  const letture = comeSiAffrontano(latoCasa, latoFuori, detail.homeTeam, detail.awayTeam);
  const cappello = cappelloDi(letture);

  // La sintesi nasce solo da ciò che è già stato letto: nessun dato nuovo, nessuna frase
  // scritta a mano. Se non c'è niente da dire, il blocco non compare.
  const h2h = detail.headToHead;
  const overallReading = prediction ? readMatch(prediction, detail.homeTeam, detail.awayTeam) : null;
  const weakestLineup = lineups && !lineups.confirmed
    ? Math.min(lineups.home?.confidence ?? 1, lineups.away?.confidence ?? 1)
    : null;
  // **Le due avvertenze che «In breve» portava, e che non si perdono.** Non sono sintesi
  // ma limiti del dato, e finiscono nella riserva del quadro: la sintesi la fa il quadro,
  // il limite va detto lo stesso.
  const avvertenze = [
    weakestLineup !== null && weakestLineup < 0.55
      ? "Le formazioni sono previste e su una delle due squadre la previsione è incerta."
      : null,
    h2h && h2h.totalMatches !== null && h2h.totalMatches > 0 && h2h.totalMatches < 4
      ? "I precedenti fra queste squadre sono pochi: contano poco."
      : null,
  ].filter((line): line is string => line !== null);

  const finished = detail.homeScore != null && detail.awayScore != null;

  // **Chi rischia il cartellino e chi puo' segnare.** Serve un undici: senza formazione,
  // prevista o ufficiale, nominare qualcuno significherebbe nominare chi non gioca. E serve
  // una tabella di base misurata per quel campionato: dove non c'e', la sezione non esiste,
  // e non si mostra a zero. A gara finita non ha piu' senso: e' una lettura del prima.
  // Il ruolo viaggia con la formazione, che porta gia' `position`: e' il metro con cui la
  // lettura confronta un giocatore, e prenderlo da qui non costa una chiamata in piu'.
  const rosaAttesa = finished ? [] : [
    ...(lineups?.home?.starters ?? []).map((g) => ({
      id: g.id, nome: g.name, squadra: lineups?.home?.teamName ?? detail.homeTeam,
      ruolo: isRuolo(g.position) ? g.position : null,
    })),
    ...(lineups?.away?.starters ?? []).map((g) => ({
      id: g.id, nome: g.name, squadra: lineups?.away?.teamName ?? detail.awayTeam,
      ruolo: isRuolo(g.position) ? g.position : null,
    })),
  ].filter(
    (g): g is { id: number; nome: string; squadra: string; ruolo: "G" | "D" | "M" | "F" | null } =>
      g.id !== null,
  );
  const giocatori =
    rosaAttesa.length === 0 || detail.leagueId === null || !haTabellaDiBase(detail.leagueId)
      ? null
      : await letturaGiocatori(eventId, detail.leagueId, detail.seasonId, rosaAttesa);
  // **In quali attesi l'arbitro è entrato davvero.** Sotto un ripiego il modello non gira,
  // quindi i suoi ingressi d'arbitro non li guarda nessuno: la sezione non può dire «è già
  // dentro il numero» se non è vero. La regola del ripiego resta quella del motore.
  const arbitroEntratoIn = bersagliConArbitroEntrato(proiezioni?.bersagli ?? [])
    .map((target) => FAMIGLIE[target]?.nome ?? target);
  // Il profilo del designato dalle **nostre** osservazioni, non dalle medie di carriera
  // che la fonte pubblica: e' la regola del piano, e qui vale doppio perche' questi stessi
  // numeri sono gia' fra gli ingressi del motore.
  // **La competizione e la stagione del profilo sono quelle di questa gara**, non quelle in
  // cui l'arbitro ha diretto di piu': senza, il pannello lo confronterebbe con i colleghi di
  // un altro torneo. Misurato sull'archivio locale il 3 settembre 2026: 329 gare su 9.240
  // sono dirette fuori dalla competizione principale di chi le fischia, e 95 arbitri su 685
  // ne hanno piu' d'una. Senza competizione o senza stagione non c'e' profilo: le medie di
  // un'altra competizione non sono un ripiego.
  const contestoArbitro = detail.leagueId === null || detail.seasonId === null ? null
    : { competitionSourceId: detail.leagueId, seasonSourceId: detail.seasonId };
  const [arbitroNostro, arbitroGare, arbitroControLoro] = detail.refereeId === null
    ? [null, [] as const, null]
    : await Promise.all([
      contestoArbitro === null ? null : profiloArbitro(detail.refereeId, contestoArbitro),
      gareDirette(detail.refereeId),
      // Quante volte ha gia' diretto queste due squadre. Nessuna chiamata nuova alla fonte:
      // `referee_id`, `team_id` e `side` stanno gia' sulla stessa riga delle osservazioni.
      detail.homeTeamId === null || detail.awayTeamId === null ? null
        : arbitroControLeSquadre(detail.refereeId, detail.homeTeamId, detail.awayTeamId),
    ]);
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
  // **Quando l'arbitro non c'e', l'assenza si dichiara dove starebbe il nome.** Misurato il
  // 29 agosto 2026 su Remo-Corinthians: la fonte risponde `referee_id: null` perche' la gara
  // e' del 2 dicembre, e la testata restava muta - l'assenza si leggeva solo in fondo, dentro
  // «Il contorno», dopo migliaia di pixel.
  const avvisoArbitro = detail.refereeId === null
    ? avvisoSenzaArbitro(detail.kickoff, new Date())
    : null;
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

  // **Le letture si ordinano su quanto sorprendono, non su quanto sono decise.** La soglia
  // di una linea nasce dall'atteso di questa gara, quindi le basi non si possono
  // precalcolare: prima si raccolgono le linee accese, poi si chiede al livello dati quante
  // volte ciascuna succede in questo campionato, poi si ordina. Si calcola una volta sola:
  // le usano il quadro in cima e la sezione che le elenca, e due calcoli darebbero due
  // ordini che possono divergere.
  const { candidate, senzaMisura } = candidateDiGara(proiezioni?.bersagli ?? []);
  const basi = candidate.length === 0 || detail.leagueId === null || detail.seasonId === null
    ? null
    : await baseDiLega(detail.leagueId, detail.seasonId, candidate.map((c) => ({
      target: c.bersaglio, lato: c.lato, soglia: c.soglia, verso: c.verso,
    })));
  const forti = proiezioni ? ordinaLetture(candidate, senzaMisura, basi) : null;
  const contesto = contestoDiGara({
    bersagli: proiezioni?.bersagli ?? [],
    forti,
    casa: latoCasa,
    fuori: latoFuori,
    stile: cappello,
    favorito: verdictFav === null ? null : { nome: verdictFav.name, probabilita: verdictFav.prob },
    gol: overallReading?.goals ?? null,
    nomeCasa: detail.homeTeam,
    nomeFuori: detail.awayTeam,
    avvertenze,
  });

  // **L'analisi finale, in fondo:** la rilettura in parole di quello che il dossier ha gia'
  // detto sopra, senza una cifra, con il rimando al capitolo da cui ogni frase esce. Nasce
  // dagli stessi oggetti che i capitoli mostrano, quindi non puo' divergere da loro.
  const nomeFamiglia = (target: string) =>
    (FAMIGLIE[target]?.nome ?? target).toLowerCase();
  const analisi = analisiFinale({
    favorito: verdictFav?.name ?? null,
    // Una famiglia per lettura, senza ripetizioni, e non piu' di due: oltre e' un elenco.
    famiglieForti: [...new Set((forti?.letture ?? []).map((l) => l.bersaglio))]
      .slice(0, 2).map(nomeFamiglia),
    cappello,
    arbitroGiudizio,
    senzaArbitro: avvisoArbitro !== null,
    senzaMisura: (forti?.senzaMisura ?? []).map(nomeFamiglia),
    senzaGol: proiezioni !== null && proiezioni.gol === null,
    senzaProiezione: proiezioni === null || proiezioni.bersagli.length === 0,
  });

  // Il contenuto del riquadro arbitro nel banner, montato una volta sola: lo stesso corpo
  // vive dentro un collegamento quando la scheda esiste, e dentro un paragrafo quando no.
  const banner = referee === null ? null : (
    <>
                <span className="oggi-hero-ref-who">
                  <span className="oggi-hero-ref-tag">Arbitro</span>
                  <span className="oggi-hero-ref-link">{referee.name}</span>
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
    </>
  );

  // **Quali aree hanno davvero qualcosa da mostrare su questa gara.** Serve una volta sola,
  // e la usano sia l'indice sia le intestazioni: cosi' la barra non puo' promettere un
  // capitolo che sotto non esiste, e un'area riservata non compare fra le destinazioni di
  // chi non puo' aprirla - il suo riquadro d'accesso resta in pagina, al posto giusto.
  const aree = {
    giocata: played && (
      (finishedStats?.headline.length ?? 0) > 0
      || (finishedStats?.rest.length ?? 0) > 0
      || (finishedStats?.shots.length ?? 0) > 0
      || (incidents?.length ?? 0) > 0
    ),
    // **La condizione e la guardia del componente sono la stessa frase, scritta una volta
    // sola.** Quando erano due, divergevano: il 3 settembre l'area Insight compariva vuota
    // sulla gara 209561. Senza il piano l'area esiste lo stesso, perche' al posto suo c'e'
    // il riquadro che dice che cosa ci sarebbe dentro.
    insight: !insight.allowed || insightHaContenuto({ contesto, dossier, forti }),
    // `MatchValoreSection` tiene solo le letture che hanno un prezzo a cui confrontarsi:
    // dei pick senza mercato non le fanno comparire.
    mercati: insight.allowed
      && (marketReading !== null || picks.some((p) => p.marketProbability !== null)),
    gol: insight.allowed && (proiezioni !== null || tempi !== null),
    proiezioni: motore.allowed,
    // Sei pannelli, sei guardie: l'area vive se ne parla almeno uno. `standings` non nullo
    // non basta - la sezione si ritira quando nessuno dei due lati ha una riga.
    trend: (insight.allowed && (
      cappello !== null
      || saltiCasa.length > 0 || saltiFuori.length > 0
      || leContese.length > 0
      || (proiezioni !== null
        && (proiezioni.ritardi.casa.length > 0 || proiezioni.ritardi.trasferta.length > 0))
    ))
      || (standings !== null && (standings.home !== null || standings.away !== null))
      || (homeForm?.length ?? 0) > 0 || (awayForm?.length ?? 0) > 0
      || proiezioni?.forma?.casa != null || proiezioni?.forma?.trasferta != null,
    contesto: true,
    giocatori: Boolean(lineups && (lineups.home || lineups.away)) || giocatori !== null,
    arbitro: (insight.allowed && arbitroNostro !== null) || referee?.careerGames != null,
    precedenti: Boolean(h2h && h2h.totalMatches) || (insight.allowed && analisi !== null),
  };

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
            {/* Tutto il riquadro apre la scheda dell'arbitro, non il solo nome: un link
                inline e' alto quanto il testo, cioe' 19 px, e sul telefono il minimo tattile
                del design system e' 44. Il nome resta sottolineato per dire che si apre. */}
            {referee !== null ? (
              detail.refereeId === null ? (
                <p className="oggi-hero-ref">{banner}</p>
              ) : (
                <Link className="oggi-hero-ref" href={`/arbitri/${detail.refereeId}`}>
                  {banner}
                </Link>
              )
            ) : avvisoArbitro === null ? null : (
              /* Stesso riquadro del designato, con l'etichetta che dice di che si parla: qui
                 non c'e' nessun numero, perche' non c'e' nessun arbitro di cui dirlo. */
              <p className="oggi-hero-ref">
                <span className="oggi-hero-ref-who">
                  <span className="oggi-hero-ref-tag">Arbitro</span>
                  <span>{avvisoArbitro.titolo}</span>
                </span>
                <span className="oggi-hero-ref-nota">{avvisoArbitro.riga}</span>
              </p>
            )}
            {/* A gara in corso il punteggio in testata si muove da solo. Fuori dalla gara in
                corso il componente non rende nulla e non arma nessun timer. */}
            <AggiornamentoLive
              gareLive={detail.status === "inprogress" || detail.status === "live" ? 1 : 0}
              ogniMs={MATCHES_TTL_MS}
            />
          </div>
        </article>


        {/* **I capitoli, e perche' ci sono.** Misurato a 375 px su una gara reale, questa
            pagina e' alta 31.462 px: circa trentanove schermate, ventuno blocchi in fila e
            nessun titolo che separi un argomento dall'altro. La barra resta in alto e dice
            sempre dove si e' arrivati; le intestazioni spezzano lo scorrimento.

            **Nessun contenuto e' stato spostato.** I blocchi sono gli stessi, nello stesso
            ordine: qui si aggiungono solo i titoli e l'indice che li segue. I due capitoli
            mancanti - «Come si affrontano» e «Analisi finale» - compariranno quando avranno
            il loro contratto dati, non prima. */}
        {/* I due capitoli condizionati seguono il diritto, non solo il dato: senza il piano
            Insight quelle sezioni non si disegnano, e un indice che punta a un'ancora che
            non esiste manda chi tocca in fondo alla pagina, dove non c'e' niente. */}
        <DossierCapitoli capitoli={capitoliDi(aree)} />

        {/* **A gara finita l'ordine cambia in cima, non ovunque.** Quello che si cerca non e'
            piu' la previsione ma il tabellino, e subito dopo se quella previsione ha tenuto.
            Le due aree esistono solo qui: su una gara da giocare i due componenti rendono
            `null` da soli, e non lasciano un capitolo vuoto. */}
        {aree.giocata ? (
          <>
            <DossierCapitolo
              id="cap-giocata"
              nome="La gara giocata"
              descrizione="Il tabellino, la mappa dei tiri, la cronologia, e il conto di quello che avevamo detto."
            />
            <MatchFinishedSection
              stats={finishedStats}
              incidents={incidents}
              homeTeam={detail.homeTeam}
              awayTeam={detail.awayTeam}
            />
            {motore.allowed ? <VerificaSection verifica={verifica} taratura={taratura} /> : null}
          </>
        ) : null}

        {aree.insight ? (
          <DossierCapitolo
            id="cap-insight"
            nome="Insight"
            descrizione="Che cosa vede IQstatS in questa gara, e quanto quella lettura regge."
          />
        ) : null}

        {/* **Un blocco solo, e dominante.** Verdetto, segnale principale con la sua forza,
            secondo segnale, valore, affidabilita', campione, conflitti e letture che
            reggono: erano quattro pannelli di pari rango - il quadro della gara, che cosa
            dice la gara, dove il modello dice qualcosa, la sintesi del valore - e chi
            apriva la pagina non sapeva quale fosse la risposta. Nessun numero e' nuovo:
            arrivano tutti da `contestoDiGara`, `matchIntelligence` e `lettureForti`. */}
        {insight.allowed ? (
          <MatchInsightSection
            contesto={contesto}
            dossier={dossier}
            forti={forti}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
          />
        ) : null}

        {/* Senza il piano non restano pannelli vuoti: al posto dell'intera area c'e' il
            riquadro che dice che cosa ci sarebbe dentro. */}
        {!insight.allowed ? (
          <SezioneRiservata
            piano="Insight"
            id="riservata-insight-title"
            autenticato={!senzaAccount}
            motivo="Sono le letture che nascono dai nostri conti sulle gare già giocate, non dal tabellino di questa."
            contenuto={[
              "Quote, movimento e confronto con il mercato",
              "Le letture più forti della gara",
              "Come si affrontano, famiglia per famiglia",
              "I mercati dei gol",
              "L’arbitro con i nostri numeri",
              "Da quanto non succede",
              "L’analisi finale",
            ]}
          />
        ) : null}

        {aree.mercati ? (
          <DossierCapitolo
            id="cap-mercati"
            nome="Mercati"
            descrizione="La nostra probabilita' contro il prezzo: quota, movimento, margine e quanto quel margine regge."
          />
        ) : null}

        {insight.allowed && marketReading ? (
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
              collegamenti esterni: qui il mercato è una misura, non una vetrina.{" "}
              {modelloDeiGol !== null
                ? "La colonna del modello sono i nostri numeri, dagli attesi delle due squadre."
                : "Su questa gara il nostro motore non copre i gol: la colonna del modello è la previsione della fonte, non la nostra."}
            </p>
          </section>
        ) : null}

        {/* Il margine fra la nostra lettura e il prezzo. Sta dentro Mercati e subito sotto il
            confronto, perche' e' la stessa domanda vista piu' da vicino: sopra si vede che
            cosa dicono i due, qui di quanto si separano e quanto quella distanza regge. */}
        {insight.allowed ? (
          <MatchValoreSection picks={picks} operatori={odds?.bookmakers ?? 0} />
        ) : null}

        {aree.gol ? (
          <DossierCapitolo
            id="cap-gol"
            nome="Gol"
            descrizione="Quanti se ne attendono, chi li segna, se segnano entrambe, e come si dividono fra primo e secondo tempo."
          />
        ) : null}

        {/* Gol: non passa dai modelli, quindi compare anche dove la proiezione non arriva */}
        {!insight.allowed ? null : proiezioni?.gol ? (
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
              Perché i mercati dei gol non compaiono su questa gara
            </h2>
            <p className="dossier-src">
              I mercati dei gol poggiano sui <b>gol attesi osservati</b> nelle gare già giocate
              della stagione. In questa competizione quella colonna non è riempita, quindi non
              c&apos;è niente su cui costruirli: nessun numero viene stimato al loro posto.
            </p>
          </section>
        )}

        {/* Primo e secondo tempo stanno **dentro** Gol e non in un'area propria: sono gli
            stessi gol, visti nella loro dimensione temporale. Un'area per ogni taglio dello
            stesso dato moltiplicherebbe i capitoli senza aggiungere una domanda. */}
        {insight.allowed && tempi !== null ? <MatchTempiSection tempi={tempi} /> : null}

        {aree.proiezioni ? (
          <DossierCapitolo
            id="cap-proiezioni"
            nome="Proiezioni"
            descrizione="Tiri, tiri in porta, falli, corner, cartellini, fuorigioco, parate: una card per famiglia, con intervallo e linea."
          />
        ) : null}

        {/* Giocate statistiche: il motore di proiezione dove c'è, altrimenti ENG-1 */}
        {!motore.allowed ? (
          <SezioneRiservata
            piano="Pro"
            id="riservata-pro-title"
            autenticato={!senzaAccount}
            motivo="È il motore: modelli addestrati fuori campione e tarati, la parte che nessun altro prodotto mette accanto ai propri numeri."
            contenuto={[
              "Le giocate statistiche dei sette bersagli, con intervallo e linea",
              "Chi può segnare e chi rischia il cartellino",
              "Il riscontro fra previsto e reale, con la taratura",
            ]}
          />
        ) : proiezioni === null || proiezioni.bersagli.length === 0 ? (
          <>
            {/* **Il silenzio si legge come un guasto.** Quando la proiezione non c'e', la
                pagina scriveva soltanto la lettura di ENG-1 e nessuno poteva sapere se il
                motore piu' preciso fosse assente per una ragione o per un difetto. */}
            <section className="dossier-panel" aria-labelledby="senza-proiezione-title">
              <p className="dossier-kick">Proiezione non disponibile</p>
              <h2 id="senza-proiezione-title" className="sr-only-heading">
                Perché la proiezione non compare su questa gara
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

        {aree.trend ? (
          <DossierCapitolo
            id="cap-trend"
            nome="Trend"
            descrizione="Come stanno arrivando: quello che una produce contro quello che l'altra concede, le ultime gare, la classifica e la forma."
          />
        ) : null}

        {insight.allowed && letture.length > 0 ? (
          <>
            <ComeSiAffrontano cappello={cappello} />
            <TrendRecente
              casa={saltiCasa}
              fuori={saltiFuori}
              nomeCasa={detail.homeTeam}
              nomeFuori={detail.awayTeam}
              gareCasa={trendCasa?.gare ?? 0}
              gareFuori={trendFuori?.gare ?? 0}
            />
            <ConteseSection
              contese={leContese}
              nomeCasa={detail.homeTeam}
              nomeFuori={detail.awayTeam}
            />
          </>
        ) : null}

        {/* **Classifica e forma, adiacenti dentro la stessa area.** Rispondono alla stessa
            domanda con due unita' di misura: la striscia dei risultati e le reti fatte e
            subite contro il metro della competizione. I due componenti restano distinti
            perche' `MatchFormaSection` vive anche su `/expected`, dove quella striscia non
            c'e': qui li tiene insieme l'area, non una fusione che romperebbe l'altra pagina. */}
        <MatchStandingsSection
          standings={standings}
          homeTeam={detail.homeTeam}
          awayTeam={detail.awayTeam}
          homeForm={homeForm}
          awayForm={awayForm}
        />

        {proiezioni?.forma ? (
          <MatchFormaSection
            casa={proiezioni.forma.casa}
            trasferta={proiezioni.forma.trasferta}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
          />
        ) : null}

        {/* Da quanto non succede, con la quota storica accanto: stesse righe della forma,
            contate in un altro modo. Chiude Trend, non apre un'area propria. */}
        {insight.allowed && proiezioni ? (
          <MatchRitardiSection
            casa={proiezioni.ritardi.casa}
            trasferta={proiezioni.ritardi.trasferta}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
          />
        ) : null}

        {aree.contesto ? (
          <DossierCapitolo
            id="cap-contesto"
            nome="Contesto"
            descrizione="Che tipo di gara aspettarsi: il ritmo con cui le due squadre ci arrivano, e la cornice in cui si gioca."
          />
        ) : null}

        {insight.allowed && ritmo !== null ? (
          <MatchRitmoSection ritmo={ritmo} homeTeam={detail.homeTeam} awayTeam={detail.awayTeam} />
        ) : null}

        {/* Il contorno: dove si gioca, con che tempo, dopo quanto viaggio. Sta qui e non piu'
            in fondo alla pagina: e' informazione che serve **prima** della gara, e prima
            della gara va letta. L'arbitro non e' piu' in questo riquadro - ha la sua area. */}
        <section className="dossier-panel" aria-labelledby="contorno-title">
          <p className="dossier-kick">La cornice</p>
          <h2 id="contorno-title" className="sr-only-heading">Stadio e condizioni</h2>
          <div className="dossier-facts">
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
        </section>

        {aree.giocatori ? (
          <DossierCapitolo
            id="cap-giocatori"
            nome="Giocatori"
            descrizione="Chi scende in campo, e che cosa ci si aspetta da chi ci scende."
          />
        ) : null}

        {/* **La formazione prima delle letture che la usano.** Fino al 3 settembre 2026 gli
            undici comparivano cinque blocchi dopo la sezione che dichiarava «formazione
            confermata»: si leggeva il giudizio prima del fatto su cui poggia. */}
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
            {/* Le due panchine stanno dentro Giocatori, chiuse: sono il contorno di chi
                gioca, non una domanda a se'. */}
            {homeCoach.esito === "trovato" || awayCoach.esito === "trovato" ? (
              <details className="dossier-spiega">
                <summary>Le due panchine</summary>
                <div className="bench-grid">
                  <Bench allenatore={homeCoach} teamName={detail.homeTeam} />
                  <Bench allenatore={awayCoach} teamName={detail.awayTeam} />
                </div>
                <p className="dossier-src">
                  Medie della gestione di ciascun allenatore, non della sola stagione in corso: il
                  numero di gare è scritto accanto.
                </p>
              </details>
            ) : null}
          </section>
        ) : null}

        {/* Chi rischia il cartellino, chi puo' segnare: la lettura sui giocatori attesi, che
            ora arriva dopo gli undici da cui dipende. */}
        {!motore.allowed || giocatori === null ? null : (
          <MatchGiocatoriSection
            lettura={giocatori}
            formazioneConfermata={lineups?.confirmed ?? false}
          />
        )}

        {aree.arbitro ? (
          <DossierCapitolo
            id="cap-arbitro"
            nome="Arbitro"
            descrizione="Come fischia, contro il metro della sua lega, e quanto pesa gia' dentro le proiezioni."
          />
        ) : null}

        {/* L'arbitro con i nostri numeri, e la dichiarazione che e' gia' dentro la
            proiezione: 16 ingressi su 85 nel modello dei gialli. */}
        {!insight.allowed || arbitroNostro === null ? null : (
          <MatchArbitroSection
            profilo={arbitroNostro}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
            entratoNei={arbitroEntratoIn}
            controLeSquadre={arbitroControLoro}
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

        {/* «Il contesto» e' stato assorbito da «Come si affrontano» il 29 agosto 2026: le
            due sezioni facevano lo stesso confronto - quanto una produce contro quanto
            l'altra concede, ciascuna dal proprio lato - con due finestre diverse, e per lo
            stesso fatto scrivevano 18,4 e 18,9. La tabella completa vive li', dietro
            «Tutte le metriche», con una finestra sola. Il componente resta: su /expected e'
            l'unica cosa che risponde a quella domanda, e li' non c'e' un capitolo che lo
            faccia. */}

        {/* **La carriera sta qui, non piu' in fondo alla pagina.** E' l'unica cosa che sa
            solo la fonte, e va letta accanto ai nostri numeri, non in un riquadro separato
            a migliaia di pixel di distanza. Le medie di lega e il campione restano sopra:
            questo dice da quanto dirige, non come fischia. */}
        {referee?.careerGames != null ? (
          <section className="dossier-panel" aria-labelledby="ref-career-title">
            <p className="dossier-kick">La carriera</p>
            <h2 id="ref-career-title" className="sr-only-heading">Carriera dell&apos;arbitro</h2>
            <div className="dossier-facts">
              <div className="dossier-fact">
                <dt>Arbitro</dt>
                <dd>{referee.name}</dd>
              </div>
              <div className="dossier-fact">
                <dt>Gare dirette</dt>
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
            </div>
            <p className="dossier-src">
              La carriera è il totale dichiarato dalla fonte su tutte le competizioni che
              segue: dice da quanto quest&apos;arbitro dirige, <b>non</b> come fischia questa
              gara, e <b>non entra nella proiezione</b>.{" "}
              {arbitroNostro === null
                ? "Di gare sue in questa competizione non ne abbiamo osservate, quindi qui "
                  + "sopra non c'è un metro con cui confrontarla: le medie di un altro torneo "
                  + "direbbero un'altra cosa."
                : "Il metro della competizione, il campione e lo sbilancio fra i due lati "
                  + "stanno qui sopra, calcolati sulle nostre osservazioni."}
            </p>
          </section>
        ) : null}

        {aree.precedenti ? (
          <DossierCapitolo
            id="cap-precedenti"
            nome="Precedenti"
            descrizione="Il testa a testa, il conto di quello che avevamo detto, e i limiti di tutto il resto."
          />
        ) : null}

        {/* **Il testa a testa e' materiale di supporto, e sta chiuso.** Chi lo cerca lo apre;
            chi legge la gara non attraversa quattro numeri che non entrano in nessuna delle
            letture sopra. Il pannello resta, con il suo campione dichiarato in chiaro. */}
        {h2h && h2h.totalMatches ? (
          <section className="dossier-panel" aria-labelledby="h2h-title">
            <p className="dossier-kick">Testa a testa</p>
            <h2 id="h2h-title" className="sr-only-heading">Precedenti</h2>
            <p className="dossier-src">Su {h2h.totalMatches} precedenti registrati dalla fonte.</p>
            <details className="dossier-spiega">
              <summary>I precedenti fra queste due squadre</summary>
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
            </details>
          </section>
        ) : null}

        {/* L'analisi finale chiude Precedenti invece di aprire un capitolo suo: e' la
            rilettura di tutto quello che sta sopra, non una decima domanda. */}
        {!insight.allowed || analisi === null ? null : <AnalisiFinale analisi={analisi} />}

        <p className="dossier-note">
          Dati letti soltanto lato server. Le probabilità sono letture di un modello statistico, mai certezze; nessun consiglio finanziario.
        </p>
      </div>
    </ProductShell>
  );
}
