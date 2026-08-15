import { VerifiedMediaImage } from "./verified-media-image";

/** Ripiego leggibile finché lo stemma non è arrivato, e per sempre se non arriva. */
function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "--";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

type TeamCrestProps = Readonly<{
  name: string;
  teamId: number | null;
  size?: "sm" | "md";
}>;

/**
 * Stemma di una squadra: l'immagine sta sopra le iniziali, così una squadra senza
 * stemma resta riconoscibile e la riga non cambia altezza. Decorativo: il nome della
 * squadra è sempre scritto accanto.
 */
export function TeamCrest({ name, teamId, size = "sm" }: TeamCrestProps) {
  const side = size === "md" ? 46 : 26;
  return (
    <span className={size === "md" ? "oggi-crest" : "oggi-crest-sm"}>
      <span className="oggi-crest-mono" aria-hidden="true">{initials(name)}</span>
      {teamId === null ? null : (
        <VerifiedMediaImage
          src={"/api/media/team/".concat(String(teamId))}
          className="oggi-crest-img"
          width={side}
          height={side}
        />
      )}
    </span>
  );
}
