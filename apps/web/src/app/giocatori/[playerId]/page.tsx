import type { Metadata } from "next";
import Link from "next/link";

import { PlayerStatsSection } from "@/components/player-stats-section";
import { ProductShell } from "@/components/product-shell";
import { VerifiedMediaImage } from "@/components/verified-media-image";
import { SQUAD_POSITION_SINGULAR } from "@/components/team-labels";
import { getPlayerDossier, type PlayerStatsSection as Section } from "@/server/iqstats/player-page";

type PlayerPageProps = {
  params: Promise<{ playerId: string }>;
};

const GIORNO: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome",
};

/** La data della fonte nel formato del prodotto; se non è una data, resta com'è. */
function giorno(iso: string): string {
  const data = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleDateString("it-IT", GIORNO);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
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

export async function generateMetadata({ params }: PlayerPageProps): Promise<Metadata> {
  const { playerId } = await params;
  const dossier = /^[1-9]\d*$/.test(playerId) ? await getPlayerDossier(playerId) : null;
  return {
    title: dossier ? `${dossier.profile.name} — IQstatS` : "Scheda giocatore — IQstatS",
  };
}

/** Nome leggibile del blocco: il nome della stagione alla fonte, o la sola competizione. */
function scopeOf(section: Section): string {
  return section.seasonName === null
    ? section.leagueName
    : section.seasonName.startsWith(section.leagueName)
      ? section.seasonName
      : `${section.leagueName} · ${section.seasonName}`;
}

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { playerId } = await params;
  if (!/^[1-9]\d*$/.test(playerId)) {
    return (
      <EmptyPage
        title="Identificativo giocatore non valido"
        message="Il collegamento non è corretto. Si arriva a un giocatore dalla rosa della sua squadra."
      />
    );
  }

  const dossier = await getPlayerDossier(playerId);
  if (dossier === null) {
    return (
      <EmptyPage
        title="Scheda giocatore non disponibile"
        message="La fonte non espone questo giocatore al momento. Nessun contenuto viene simulato."
      />
    );
  }

  const { profile, stagione, precedente, carriera } = dossier;
  const ruolo = profile.position ? SQUAD_POSITION_SINGULAR[profile.position] : null;

  return (
    <ProductShell activeSection="teams">
      <div className="oggi-backdrop" aria-hidden="true" />
      <div className="dossier squad-page">
        <Link
          className="dossier-back"
          href={profile.currentTeam ? `/squadre/${profile.currentTeam.id}` : "/partite"}
        >
          ← {profile.currentTeam?.name ?? "Partite"}
        </Link>

        <article className="oggi-hero">
          <div className="oggi-hero-stadium" aria-hidden="true" />
          <div className="oggi-hero-scrim" aria-hidden="true" />
          <div className="oggi-hero-glow" aria-hidden="true" />
          <div className="oggi-hero-body">
            <p className="oggi-hero-comp">
              {[ruolo, profile.specificPosition, profile.currentTeam?.name]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="oggi-hero-teams">
              <span className="oggi-team">
                <span className="oggi-crest">
                  <span className="oggi-crest-mono" aria-hidden="true">
                    {initials(profile.name)}
                  </span>
                  <VerifiedMediaImage
                    src={`/api/media/player/${profile.playerId}`}
                    className="oggi-crest-img"
                    width={46}
                    height={46}
                  />
                </span>
                <h1 className="oggi-team-name">{profile.name}</h1>
              </span>
            </div>
            <div className="oggi-hero-foot">
              <span className="oggi-chip">
                {profile.jerseyNumber !== null ? `#${profile.jerseyNumber}` : "senza numero"}
                {profile.nationality ? ` · ${profile.nationality}` : ""}
                {profile.heightCm !== null ? ` · ${profile.heightCm} cm` : ""}
              </span>
              {profile.availabilityStatus === "injured" ? (
                <span className="oggi-chip">
                  Infortunato
                  {profile.injuryType ? ` · ${profile.injuryType}` : ""}
                  {profile.injuryExpectedReturn
                    ? ` · rientro atteso ${giorno(profile.injuryExpectedReturn)}`
                    : ""}
                </span>
              ) : null}
              <span className="oggi-prov">giocatore {profile.playerId}</span>
            </div>
          </div>
        </article>

        {stagione?.envelope.data ? (
          <PlayerStatsSection
            kick="Stagione in corso"
            title="Quanto ha giocato e cosa ha fatto, quest'anno"
            scope={scopeOf(stagione)}
            block={stagione.envelope.data}
            position={profile.position}
            emptyMessage="La fonte non espone gare di questo giocatore nella stagione in corso. Nessun totale viene mostrato a zero."
          />
        ) : (
          <section className="dossier-panel">
            <p className="dossier-kick">Stagione in corso</p>
            <p className="squad-empty-inline">
              La stagione in corso di questo giocatore non è raggiungibile: senza una squadra
              con storico alla fonte non sappiamo in quale competizione cercarla.
            </p>
          </section>
        )}

        {precedente?.envelope.data ? (
          <PlayerStatsSection
            kick="Stagione precedente"
            title="Lo stesso conto, l'anno prima"
            scope={scopeOf(precedente)}
            block={precedente.envelope.data}
            position={profile.position}
            emptyMessage="La fonte non espone gare di questo giocatore nella stagione precedente della stessa competizione."
          />
        ) : null}

        {carriera?.data ? (
          <PlayerStatsSection
            kick="Carriera"
            title="Tutto quello che la fonte tiene di lui"
            scope={
              carriera.data.teams.length > 1
                ? `Tutte le competizioni e ${carriera.data.teams.length} squadre. Le righe della carriera non portano una data, quindi il totale non si divide per anno`
                : "Tutte le competizioni. Le righe della carriera non portano una data, quindi il totale non si divide per anno"
            }
            block={carriera.data}
            position={profile.position}
            emptyMessage="La fonte non tiene statistiche per gara di questo giocatore."
          />
        ) : null}
      </div>
    </ProductShell>
  );
}
