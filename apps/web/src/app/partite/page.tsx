import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";
import { LeagueIdentity } from "@/components/league-identity";
import { VerifiedMediaImage } from "@/components/verified-media-image";
import { LeagueSelect, type LeagueOption } from "@/components/league-select";
import { getMatchesByDate, type MatchListItem } from "@/server/iqstats/matches";
import { getPredictionsByDate } from "@/server/iqstats/predictions";
import { readMatch, readOutcome } from "@/server/iqstats/match-reading";

export const metadata: Metadata = {
  title: "Partite",
  description: "Le gare del giorno di tutti i campionati, con calendario dei prossimi giorni. Filtro lega opzionale.",
};

type PartitePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const timeFormatter = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

function todayRomeIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

function buildDateBar(todayIso: string): { iso: string; label: string }[] {
  const base = new Date(`${todayIso}T12:00:00Z`);
  const labelFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
  const isoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime() + i * 86_400_000);
    return { iso: isoFmt.format(d), label: labelFmt.format(d).replace(".", "") };
  });
}

function scalar(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function formatTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : timeFormatter.format(d);
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function statusInfo(status: string): { label: string; tone: string } {
  const map: Record<string, { label: string; tone: string }> = {
    notstarted: { label: "Prossima", tone: "next" },
    upcoming: { label: "Prossima", tone: "next" },
    inprogress: { label: "Live", tone: "live" },
    live: { label: "Live", tone: "live" },
    finished: { label: "Conclusa", tone: "done" },
    postponed: { label: "Rinviata", tone: "warn" },
    cancelled: { label: "Annullata", tone: "warn" },
  };
  return map[status] ?? { label: "—", tone: "next" };
}

function Crest({ name, teamId }: { name: string; teamId: number | null }) {
  return (
    <span className="oggi-crest-sm">
      <span className="oggi-crest-mono" aria-hidden="true">{initials(name)}</span>
      {teamId ? <VerifiedMediaImage src={`/api/media/team/${teamId}`} className="oggi-crest-img" width={26} height={26} /> : null}
    </span>
  );
}

interface Group {
  readonly id: number | null;
  readonly name: string | null;
  readonly countryCode: string | null;
  readonly matches: MatchListItem[];
}

export default async function PartitePage({ searchParams }: PartitePageProps) {
  const query = await searchParams;
  const today = todayRomeIso();
  const dateParam = scalar(query.date);
  const activeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;
  const leagueParam = scalar(query.leagueId);
  const leagueId = /^[1-9]\d*$/.test(leagueParam) ? Number(leagueParam) : null;

  // Gare e letture dello stesso giorno: le letture arrivano da una richiesta sola, quindi
  // l'assaggio in ogni riga non costa traffico in più.
  const [result, predictions] = await Promise.all([
    getMatchesByDate(activeDate),
    getPredictionsByDate(activeDate),
  ]);
  const allMatches = result.matches;
  const readings = new Map(predictions.predictions.map((p) => [p.eventId, p]));

  // Opzioni del filtro lega = solo i campionati che HANNO gare quel giorno.
  const optionMap = new Map<number, LeagueOption>();
  for (const m of allMatches) {
    if (m.leagueId === null) continue;
    const existing = optionMap.get(m.leagueId);
    if (existing) optionMap.set(m.leagueId, { ...existing, count: existing.count + 1 });
    else optionMap.set(m.leagueId, { id: m.leagueId, label: m.leagueName ?? `Lega ${m.leagueId}`, count: 1 });
  }
  const leagueOptions = [...optionMap.values()].sort((a, b) => a.label.localeCompare(b.label));

  const shown = leagueId ? allMatches.filter((m) => m.leagueId === leagueId) : allMatches;

  const groups: Group[] = [];
  const groupMap = new Map<number | string, Group>();
  for (const m of shown) {
    const key = m.leagueId ?? "unknown";
    let g = groupMap.get(key);
    if (!g) {
      g = { id: m.leagueId, name: m.leagueName, countryCode: m.leagueCountryCode, matches: [] };
      groupMap.set(key, g);
      groups.push(g);
    }
    g.matches.push(m);
  }

  const dateBar = buildDateBar(today);
  const dateLabel = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${activeDate}T12:00:00Z`));

  return (
    <ProductShell activeSection="matches">
      <div className="oggi-backdrop" aria-hidden="true" />
      <section className="partite" aria-labelledby="partite-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Partite</span>
          <span className="oggi-line" aria-hidden="true" />
          <span className="oggi-src">
            {result.source === "provider"
              ? [
                String(allMatches.length).concat(" gare"),
                String(leagueOptions.length).concat(" competizioni"),
                // L'endpoint del calendario non espone nessuna data di aggiornamento: l'unico
                // istante vero e' quello in cui l'abbiamo letto, e la risposta resta in cache
                // per 120 secondi, quindi non coincide con il momento del render.
                result.lettoIl ? "letto alle ".concat(timeFormatter.format(new Date(result.lettoIl))) : null,
              ].filter((voce): voce is string => voce !== null).join(" · ")
              : "Elenco non disponibile"}
          </span>
        </div>
        <h1 id="partite-title" className="partite-title">{dateLabel}</h1>

        <nav className="partite-datebar" aria-label="Scegli il giorno">
          {dateBar.map((d) => (
            <Link
              key={d.iso}
              href={`/partite?date=${d.iso}`}
              className={`partite-date${d.iso === activeDate ? " is-active" : ""}`}
              aria-current={d.iso === activeDate ? "page" : undefined}
            >
              {d.iso === today ? "Oggi" : d.label}
            </Link>
          ))}
        </nav>

        {leagueOptions.length > 0 ? (
          <div className="partite-filter">
            <label htmlFor="league-filter" className="partite-filter-label">Campionato</label>
            <LeagueSelect date={activeDate} current={leagueId} options={leagueOptions} total={allMatches.length} />
            <span className="partite-filter-hint">Facoltativo · di default vedi tutte le gare del giorno.</span>
          </div>
        ) : null}

        {groups.length > 0 ? (
          <div className="partite-groups">
            {groups.length > 1 ? (
              <nav className="partite-index" aria-label="Vai a un campionato">
                {groups.map((g) => (
                  <a
                    className="partite-index-link"
                    key={g.id ?? "unknown"}
                    href={"#lega-".concat(String(g.id ?? "altre"))}
                  >
                    <LeagueIdentity leagueId={g.id} name={g.name ?? "Altre"} code={g.countryCode} size="sm" />
                    <i>{g.matches.length}</i>
                  </a>
                ))}
              </nav>
            ) : null}

            {groups.map((g) => (
              <details
                key={g.id ?? "unknown"}
                id={"lega-".concat(String(g.id ?? "altre"))}
                className="partite-group"
                open
              >
                <summary className="partite-group-head">
                  <LeagueIdentity leagueId={g.id} name={g.name} code={g.countryCode} />
                  <span className="partite-group-count">
                    {g.matches.length} · dalle {formatTime(g.matches[0]?.kickoff ?? "")}
                  </span>
                </summary>
                <ul className="partite-list">
                  {g.matches.map((m) => {
                    const st = statusInfo(m.status);
                    const finished = m.homeScore != null && m.awayScore != null;
                    const prediction = readings.get(m.eventId) ?? null;
                    const reading = prediction ? readMatch(prediction, m.homeTeam, m.awayTeam) : null;
                    const outcome = prediction ? readOutcome(prediction, m.homeScore, m.awayScore) : null;
                    return (
                      <li key={m.eventId}>
                        <Link className="partite-row" href={`/match/${m.eventId}`}>
                          <span className="partite-time">{formatTime(m.kickoff)}</span>
                          <span className="partite-teams">
                            <span className="partite-team"><Crest name={m.homeTeam} teamId={m.homeTeamId} />{m.homeTeam}</span>
                            <span className="partite-team"><Crest name={m.awayTeam} teamId={m.awayTeamId} />{m.awayTeam}</span>
                            <span className="partite-read">
                              <span className="partite-read-line">
                                <em>
                                  {finished && outcome
                                    ? outcome
                                    : reading
                                      ? [reading.headline, reading.goals].filter(Boolean).join(" · ")
                                      : "Lettura non disponibile per questa gara"}
                                </em>
                                <i aria-hidden="true">Apri l&apos;analisi ›</i>
                              </span>
                              {reading?.thread ? (
                                <span className="signals-thread" aria-hidden="true">
                                  <span className="signals-thread-home" style={{ flexGrow: reading.thread.home }} />
                                  <span className="signals-thread-draw" style={{ flexGrow: reading.thread.draw }} />
                                  <span className="signals-thread-away" style={{ flexGrow: reading.thread.away }} />
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <span className="partite-outcome">
                            {finished
                              ? <span className="partite-score">{m.homeScore}<br />{m.awayScore}</span>
                              : <span className={`partite-badge tone-${st.tone}`}>{st.label}</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        ) : (
          <div className="oggi-empty">
            <h2>Nessuna gara per questo giorno</h2>
            <p>
              {result.source === "provider"
                ? "Non risultano gare per la data selezionata (o per il campionato filtrato). Prova un altro giorno dal calendario."
                : "La fonte non è raggiungibile ora. Riprova più tardi: non mostriamo dati inventati."}
            </p>
          </div>
        )}

        <p className="oggi-note">Dati letti soltanto lato server. Orari in ora italiana. Elenco del giorno, tutti i campionati salvo filtro.</p>
      </section>
    </ProductShell>
  );
}
