import type { Metadata } from "next";
import Link from "next/link";

import { LeagueIdentity } from "@/components/league-identity";
import { ProductShell } from "@/components/product-shell";
import { VerifiedMediaImage } from "@/components/verified-media-image";
import { getPredictionsByDate, type DashboardPrediction } from "@/server/iqstats/predictions";
import { getMatchDetail } from "@/server/iqstats/match-context";
import { getLeaguesIndex } from "@/server/iqstats/matches";

export const metadata: Metadata = {
  title: "Oggi",
  description: "Le gare in arrivo e i migliori segnali del modello, con fonte e freschezza dichiarate.",
};

const kickoffFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "short",
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
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function favouriteName(p: DashboardPrediction): string {
  if (p.favorite === "H") return p.homeTeam;
  if (p.favorite === "A") return p.awayTeam;
  if (p.favorite === "D") return "Pareggio";
  return "—";
}

function strongestSignal(p: DashboardPrediction): { label: string } | null {
  if (p.probOver25 != null && p.probOver25 >= 55) return { label: `Over 2.5 · ${Math.round(p.probOver25)}%` };
  if (p.probBtts != null && p.probBtts >= 55) return { label: `Gol/Gol · ${Math.round(p.probBtts)}%` };
  if (p.favoriteProb != null && p.favoriteProb >= 60) return { label: `${favouriteName(p)} avanti` };
  return null;
}

function relativeFreshness(iso: string | null): string {
  if (!iso) return "freschezza non dichiarata";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "freschezza non dichiarata";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 60) return `aggiornato ${minutes} min fa`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `aggiornato ${hours} h fa`;
  return `aggiornato ${Math.round(hours / 24)} g fa`;
}

function Crest({ name, teamId, className }: { name: string; teamId: number | null; className: string }) {
  return (
    <span className={className}>
      <span className="oggi-crest-mono" aria-hidden="true">{initials(name)}</span>
      {teamId ? (
        <VerifiedMediaImage src={`/api/media/team/${teamId}`} className="oggi-crest-img" width={46} height={46} />
      ) : null}
    </span>
  );
}

export default async function OggiPage() {
  // Il perimetro è il giorno italiano, lo stesso della home e dell'elenco partite.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const result = await getPredictionsByDate(today);
  const upcoming = result.predictions.filter(
    (p) => p.status !== "finished" && p.status !== "postponed" && p.status !== "cancelled",
  );
  const soon = upcoming.slice(0, 16);
  const featured = soon.reduce<DashboardPrediction | null>((best, p) => {
    if (!best) return p;
    return (p.confidence ?? 0) > (best.confidence ?? 0) ? p : best;
  }, null);
  const rest = soon.filter((p) => p.eventId !== featured?.eventId).slice(0, 8);
  // Indice delle competizioni: serve per la sigla del paese, ha una cache lunga e viaggia
  // insieme al contesto della gara in evidenza.
  const [featuredContext, leagueIndex] = await Promise.all([
    featured ? getMatchDetail(featured.eventId) : Promise.resolve(null),
    getLeaguesIndex(),
  ]);

  return (
    <ProductShell activeSection="today">
      <div className="oggi-backdrop" aria-hidden="true" />
      <section className="oggi" aria-labelledby="oggi-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Oggi</span>
          <span className="oggi-line" aria-hidden="true" />
          <span className="oggi-src">
            {result.source === "provider" ? "Letture del modello" : "Dati non disponibili"}
          </span>
        </div>
        <h1 id="oggi-title" className="sr-only-heading">
          Le gare in arrivo e i migliori segnali del modello
        </h1>

        {featured ? (
          <article className="oggi-hero">
            <div className="oggi-hero-stadium" aria-hidden="true" />
            {featuredContext?.venueId ? (
              <div
                className="oggi-hero-venue"
                style={{ backgroundImage: `url(/api/media/venue/${featuredContext.venueId})` }}
                aria-hidden="true"
              />
            ) : null}
            <div className="oggi-hero-scrim" aria-hidden="true" />
            <div className="oggi-hero-glow" aria-hidden="true" />
            <div className="oggi-hero-body">
              <p className="oggi-hero-comp">
                <LeagueIdentity
                  leagueId={featured.leagueId}
                  name={featured.leagueName ?? "Competizione"}
                  code={featured.leagueId === null ? null : leagueIndex.get(featured.leagueId)?.countryCode ?? null}
                  size="sm"
                />
                <span className="oggi-hero-when">{formatKickoff(featured.kickoff)}</span>
              </p>
              <div className="oggi-hero-teams">
                <span className="oggi-team">
                  <Crest name={featured.homeTeam} teamId={featured.homeTeamId} className="oggi-crest" />
                  <span className="oggi-team-name">{featured.homeTeam}</span>
                </span>
                <span className="oggi-vs">contro</span>
                <span className="oggi-team oggi-team-away">
                  <span className="oggi-team-name">{featured.awayTeam}</span>
                  <Crest name={featured.awayTeam} teamId={featured.awayTeamId} className="oggi-crest" />
                </span>
              </div>
              <p className="oggi-hero-verdict">
                {featured.favorite && featured.favoriteProb != null ? (
                  <>
                    <span className="oggi-lead">{favouriteName(featured)} favorita al {Math.round(featured.favoriteProb)}%.</span>{" "}
                    {featured.probOver25 != null
                      ? `Gol attesi con Over 2.5 al ${Math.round(featured.probOver25)}%.`
                      : "Copertura gol non disponibile per questa gara."}
                  </>
                ) : (
                  "Verdetto del modello non disponibile per questa gara."
                )}
              </p>
              <div className="oggi-hero-foot">
                {strongestSignal(featured) ? (
                  <span className="oggi-chip">{strongestSignal(featured)?.label}</span>
                ) : null}
                <span className="oggi-prov">{relativeFreshness(featured.createdAt)}</span>
                <Link className="oggi-cta" href={`/match/${featured.eventId}`}>
                  Apri il dossier →
                </Link>
              </div>
            </div>
          </article>
        ) : (
          <div className="oggi-empty">
            <h2>Nessuna gara con pronostico al momento</h2>
            <p>
              {result.source === "provider"
                ? "Il modello non espone gare in arrivo in questa finestra. Nessun contenuto viene simulato."
                : "La fonte pronostici non è raggiungibile ora. Riprova più tardi: non mostriamo dati inventati."}
            </p>
          </div>
        )}

        {rest.length > 0 ? (
          <section className="oggi-signals" aria-labelledby="oggi-signals-title">
            <div className="oggi-signals-head">
              <h2 id="oggi-signals-title">Migliori segnali del giorno</h2>
              <span className="oggi-count">{upcoming.length} gare di oggi ancora da giocare</span>
            </div>
            <div className="oggi-grid">
              {rest.map((p) => (
                <Link key={p.eventId} className="oggi-card" href={`/match/${p.eventId}`}>
                  <span className="oggi-card-comp">
                    <LeagueIdentity
                      leagueId={p.leagueId}
                      name={p.leagueName ?? "Competizione"}
                      code={p.leagueId === null ? null : leagueIndex.get(p.leagueId)?.countryCode ?? null}
                      size="sm"
                    />
                    <span className="oggi-card-when">{formatKickoff(p.kickoff)}</span>
                  </span>
                  <span className="oggi-card-crests" aria-hidden="true">
                    <Crest name={p.homeTeam} teamId={p.homeTeamId} className="oggi-crest-sm" />
                    <Crest name={p.awayTeam} teamId={p.awayTeamId} className="oggi-crest-sm" />
                  </span>
                  <span className="oggi-card-match">
                    {p.homeTeam} <em>—</em> {p.awayTeam}
                  </span>
                  <span className="oggi-card-verdict">
                    {p.favorite && p.favoriteProb != null
                      ? <><b>{favouriteName(p)}</b> favorita al {Math.round(p.favoriteProb)}%</>
                      : "Verdetto non disponibile"}
                  </span>
                  <span className="oggi-meter" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, Math.round(p.favoriteProb ?? 0))}%` }} />
                  </span>
                  <span className="oggi-card-foot">
                    <span>{p.probOver25 != null ? `Over 2.5 ${Math.round(p.probOver25)}%` : "Over n/d"}</span>
                    <span>{p.probBtts != null ? `BTTS ${Math.round(p.probBtts)}%` : "BTTS n/d"}</span>
                  </span>
                </Link>
              ))}
            </div>
            <p className="oggi-note">
              Le probabilità sono letture di un modello statistico, non certezze. Nessun consiglio
              finanziario.
            </p>
          </section>
        ) : null}
      </section>
    </ProductShell>
  );
}
