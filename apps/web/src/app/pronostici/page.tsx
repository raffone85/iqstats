import type { Metadata } from "next";
import Link from "next/link";

import { LeagueIdentity } from "@/components/league-identity";
import { ProductShell } from "@/components/product-shell";
import { TeamCrest } from "@/components/team-crest";
import { getLeaguesIndex } from "@/server/iqstats/matches";
import { getUpcomingPredictions, type DashboardPrediction } from "@/server/iqstats/predictions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pronostici",
  description:
    "Le gare in arrivo lette dal modello: probabilità 1X2, gol attesi, over 2.5 e gol/gol, con fonte e campione dichiarati.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Market = "favorito" | "over25" | "gol-gol";
type TimeWindow = "oggi" | "domani" | "settimana" | "tutte";
type Order = "orario" | "probabilita" | "confidenza";

const MARKETS: readonly { value: Market; label: string }[] = [
  { value: "favorito", label: "Esito favorito" },
  { value: "over25", label: "Over 2.5" },
  { value: "gol-gol", label: "Gol/Gol" },
];

const WINDOWS: readonly { value: TimeWindow; label: string }[] = [
  { value: "oggi", label: "Oggi" },
  { value: "domani", label: "Domani" },
  { value: "settimana", label: "Prossimi 7 giorni" },
  { value: "tutte", label: "Tutte le gare in arrivo" },
];

const ORDERS: readonly { value: Order; label: string }[] = [
  { value: "orario", label: "Orario di inizio" },
  { value: "probabilita", label: "Probabilità del mercato" },
  { value: "confidenza", label: "Confidenza del modello" },
];

const THRESHOLDS = [0, 50, 55, 60, 65, 70, 75] as const;

const romeDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ORA = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
});

const GIORNO = new Intl.DateTimeFormat("it-IT", {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome",
});

const kickoffTime = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  hour: "2-digit",
  minute: "2-digit",
});

const kickoffDay = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "numeric",
  month: "short",
});

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function dayKey(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : romeDay.format(date);
}

function shiftedDayKey(days: number): string {
  return romeDay.format(new Date(Date.now() + days * 86_400_000));
}

/** Percentuale del modello: già 0–100. Un valore assente resta assente. */
function pct(value: number | null): string {
  return value === null ? "—" : Math.round(value) + "%";
}

/** La confidenza arriva 0–1 e va portata sulla stessa scala delle probabilità. */
function confidencePct(value: number | null): string {
  return value === null ? "—" : Math.round(value * 100) + "%";
}

function decimal(value: number | null): string {
  return value === null ? "—" : value.toFixed(2).replace(".", ",");
}

function favouriteLabel(p: DashboardPrediction): string {
  if (p.favorite === "H") return p.homeTeam;
  if (p.favorite === "A") return p.awayTeam;
  if (p.favorite === "D") return "Pareggio";
  return "—";
}

/** Probabilità su cui agiscono soglia e ordinamento, secondo il mercato scelto. */
function marketProb(p: DashboardPrediction, market: Market): number | null {
  if (market === "over25") return p.probOver25;
  if (market === "gol-gol") return p.probBtts;
  return p.favoriteProb;
}

function marketLabel(market: Market): string {
  return MARKETS.find((m) => m.value === market)?.label ?? "Esito favorito";
}

export default async function PronosticiPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  // L'indice delle competizioni serve solo per la sigla del paese: è in cache e non
  // aggiunge una richiesta a ogni apertura della pagina.
  const [query, result, leagueIndex] = await Promise.all([
    searchParams,
    getUpcomingPredictions(100),
    getLeaguesIndex(),
  ]);

  const timeWindow = WINDOWS.find((w) => w.value === scalar(query.quando))?.value ?? "oggi";
  const market = MARKETS.find((m) => m.value === scalar(query.mercato))?.value ?? "favorito";
  const order = ORDERS.find((o) => o.value === scalar(query.ordine))?.value ?? "orario";
  const thresholdRaw = Number.parseInt(scalar(query.soglia), 10);
  const threshold = THRESHOLDS.includes(thresholdRaw as (typeof THRESHOLDS)[number])
    ? thresholdRaw
    : 0;
  const leagueRaw = Number.parseInt(scalar(query.lega), 10);
  const league = Number.isInteger(leagueRaw) ? leagueRaw : null;

  const scheduled = result.predictions.filter((p) => p.status !== "finished" && p.kickoff);

  // Il catalogo delle competizioni nasce dalle gare già scaricate: nessuna richiesta in più.
  const leagues = [
    ...new Map(
      scheduled
        .filter((p) => p.leagueId !== null && p.leagueName)
        .map((p) => [p.leagueId as number, p.leagueName as string]),
    ),
  ].sort((a, b) => a[1].localeCompare(b[1], "it"));

  const today = shiftedDayKey(0);
  const tomorrow = shiftedDayKey(1);
  const weekEnd = shiftedDayKey(7);

  const filtered = scheduled.filter((p) => {
    const key = dayKey(p.kickoff);
    if (timeWindow === "oggi" && key !== today) return false;
    if (timeWindow === "domani" && key !== tomorrow) return false;
    // Le chiavi sono giorni ISO di Roma: il confronto testuale è anche cronologico.
    if (timeWindow === "settimana" && (key === null || key > weekEnd)) return false;
    if (league !== null && p.leagueId !== league) return false;
    if (threshold > 0) {
      const prob = marketProb(p, market);
      // Una gara priva di quel mercato resta fuori: un dato assente non vale zero.
      if (prob === null || prob < threshold) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (order === "probabilita") {
      return (marketProb(b, market) ?? -1) - (marketProb(a, market) ?? -1);
    }
    if (order === "confidenza") return (b.confidence ?? -1) - (a.confidence ?? -1);
    return a.kickoff.localeCompare(b.kickoff);
  });

  // **La data vera di questa pagina e' quando il modello ha calcolato, non quando l'abbiamo
  // letto.** La fonte espone `created_at` su ogni riga e il modello gira di notte, quindi le
  // righe in elenco non nascono tutte lo stesso giorno: si dichiara la finestra, non un
  // istante solo, perche' un istante solo direbbe che sono tutte fresche uguale.
  const calcolati = sorted
    .map((p) => p.createdAt)
    .filter((quando): quando is string => quando !== null)
    .sort();
  const calcolatoDa = calcolati[0] ?? null;
  const calcolatoA = calcolati[calcolati.length - 1] ?? null;

  const filtersActive =
    timeWindow !== "oggi" ||
    market !== "favorito" ||
    threshold > 0 ||
    league !== null ||
    order !== "orario";

  return (
    <ProductShell activeSection="predictions">
      <section className="page-intro signals-intro" aria-labelledby="signals-title">
        <p className="eyebrow">Pronostici</p>
        <h1 id="signals-title">Le gare in arrivo, lette dal modello.</h1>
        <p>
          Ogni riga mostra che cosa assegna il modello e su quale mercato. I numeri sono suoi, la
          scelta resta tua: qui non trovi consigli di giocata.{" "}
          {/* La fonte non dichiara quando ha aggiornato le sue letture: l'unico istante vero e'
              quello della nostra richiesta, e sta nella busta perche' la risposta resta in
              cache per 120 secondi. */}
          {calcolatoDa === null || calcolatoA === null
            ? ""
            : calcolatoDa.slice(0, 10) === calcolatoA.slice(0, 10)
              ? `Letture calcolate dal modello il ${GIORNO.format(new Date(calcolatoA))}.`
              : `Letture calcolate dal modello fra il ${GIORNO.format(new Date(calcolatoDa))} e il ${GIORNO.format(new Date(calcolatoA))}.`}
          {result.lettoIl ? ` Lette dalla fonte alle ${ORA.format(new Date(result.lettoIl))}.` : ""}
        </p>
      </section>

      <form className="signals-filters" method="get" aria-labelledby="signals-filters-title">
        <h2 id="signals-filters-title" className="signals-filters-title">
          Restringi l&apos;elenco
        </h2>
        <div className="signals-filter-grid">
          <p className="signals-field">
            <label htmlFor="filter-quando">Quando</label>
            <select id="filter-quando" name="quando" defaultValue={timeWindow}>
              {WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </p>

          <p className="signals-field">
            <label htmlFor="filter-lega">Competizione</label>
            <select id="filter-lega" name="lega" defaultValue={league === null ? "" : String(league)}>
              <option value="">Tutte le competizioni</option>
              {leagues.map(([id, name]) => (
                <option key={id} value={String(id)}>{name}</option>
              ))}
            </select>
          </p>

          <p className="signals-field">
            <label htmlFor="filter-mercato">Mercato</label>
            <select id="filter-mercato" name="mercato" defaultValue={market}>
              {MARKETS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </p>

          <p className="signals-field">
            <label htmlFor="filter-soglia">Probabilità minima</label>
            <select id="filter-soglia" name="soglia" defaultValue={String(threshold)}>
              {THRESHOLDS.map((t) => (
                <option key={t} value={String(t)}>
                  {t === 0 ? "Nessuna soglia" : "Almeno " + t + "%"}
                </option>
              ))}
            </select>
          </p>

          <p className="signals-field">
            <label htmlFor="filter-ordine">Ordina per</label>
            <select id="filter-ordine" name="ordine" defaultValue={order}>
              {ORDERS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </p>
        </div>

        <div className="signals-filter-actions">
          <button type="submit">Applica</button>
          {filtersActive ? (
            <Link className="signals-reset" href="/pronostici">Azzera i filtri</Link>
          ) : null}
        </div>
      </form>

      {result.source === "unavailable" ? (
        <section
          className="data-state"
          role="status"
          aria-live="polite"
          aria-labelledby="signals-down-title"
        >
          <p className="eyebrow">Modello non raggiungibile</p>
          <h2 id="signals-down-title">Non possiamo leggere i pronostici in questo momento.</h2>
          <p>
            Non mostriamo valori sostitutivi. Riprova fra qualche minuto: la lista torna appena la
            fonte risponde.
          </p>
        </section>
      ) : sorted.length === 0 ? (
        <section
          className="data-state"
          role="status"
          aria-live="polite"
          aria-labelledby="signals-empty-title"
        >
          <p className="eyebrow">Nessun risultato</p>
          <h2 id="signals-empty-title">Nessuna gara risponde a questi filtri.</h2>
          <p>
            Allarga la finestra temporale, togli la soglia di probabilità o scegli tutte le
            competizioni. Le gare prive del mercato scelto restano fuori quando imposti una soglia:
            un dato assente non vale zero.
          </p>
        </section>
      ) : (
        <section className="signals-board" aria-labelledby="signals-board-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Elenco</p>
              <h2 id="signals-board-title">
                {sorted.length} {sorted.length === 1 ? "gara" : "gare"} · {marketLabel(market)}
              </h2>
            </div>
            <p>Le percentuali sono letture di un modello statistico, non quote di mercato.</p>
          </div>

          <ol className="signals-list">
            {sorted.map((p) => {
              const probs =
                p.probHome !== null && p.probDraw !== null && p.probAway !== null
                  ? { home: p.probHome, draw: p.probDraw, away: p.probAway }
                  : null;
              const kickoff = new Date(p.kickoff);
              return (
                <li key={p.eventId} className="signals-row">
                  <Link className="signals-row-link" href={"/match/" + p.eventId}>
                    <span className="signals-when">
                      <strong>{kickoffTime.format(kickoff)}</strong>
                      <em>{kickoffDay.format(kickoff)}</em>
                    </span>

                    <span className="signals-match">
                      <span className="signals-teams">
                        <TeamCrest name={p.homeTeam} teamId={p.homeTeamId} />
                        {p.homeTeam} <span aria-hidden="true">·</span>
                        <TeamCrest name={p.awayTeam} teamId={p.awayTeamId} />
                        {p.awayTeam}
                      </span>
                      <LeagueIdentity
                        leagueId={p.leagueId}
                        name={p.leagueName ?? "Competizione non dichiarata"}
                        code={p.leagueId === null ? null : leagueIndex.get(p.leagueId)?.countryCode ?? null}
                        size="sm"
                      />
                    </span>

                    <span className="signals-verdict">
                      {probs ? (
                        <span className="signals-thread" aria-hidden="true">
                          <span className="signals-thread-home" style={{ flexGrow: probs.home }} />
                          <span className="signals-thread-draw" style={{ flexGrow: probs.draw }} />
                          <span className="signals-thread-away" style={{ flexGrow: probs.away }} />
                        </span>
                      ) : null}
                      <em>
                        {probs
                          ? "1 " + pct(probs.home) + " · X " + pct(probs.draw) + " · 2 " + pct(probs.away)
                          : "1X2 non coperto"}
                      </em>
                    </span>

                    <span className="signals-figures">
                      <span className="signals-figure signals-figure-name">
                        <em>Favorito</em>
                        <strong>{favouriteLabel(p)}</strong>
                        <i>{pct(p.favoriteProb)}</i>
                      </span>
                      <span className="signals-figure">
                        <em>Over 2.5</em>
                        <strong>{pct(p.probOver25)}</strong>
                      </span>
                      <span className="signals-figure">
                        <em>Gol/Gol</em>
                        <strong>{pct(p.probBtts)}</strong>
                      </span>
                      <span className="signals-figure">
                        <em>Gol attesi</em>
                        <strong>{decimal(p.xgHome)} · {decimal(p.xgAway)}</strong>
                      </span>
                      <span className="signals-figure">
                        <em>Più probabile</em>
                        <strong>{p.mostLikelyScore ?? "—"}</strong>
                      </span>
                      <span className="signals-figure">
                        <em>Confidenza</em>
                        <strong>{confidencePct(p.confidence)}</strong>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="method-panel signals-method" aria-labelledby="signals-method-title">
        <p className="eyebrow">Come leggere questa pagina</p>
        <h2 id="signals-method-title">Una probabilità non è una previsione.</h2>
        <p>
          I valori arrivano dal modello e vengono mostrati come sono, senza riempire i
          campi mancanti. Un trattino significa che quel mercato non è coperto per quella gara, non
          che vale zero. La confidenza è la fiducia dichiarata dal modello su sé stesso, non la
          probabilità che l&apos;esito accada.
        </p>
        <p>
          L&apos;elenco copre le prime cento gare in arrivo pubblicate dal modello: se il calendario
          è fitto, le finestre più larghe si fermano a quel tetto.
        </p>
      </section>
    </ProductShell>
  );
}
