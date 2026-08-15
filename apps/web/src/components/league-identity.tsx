import { VerifiedMediaImage } from "./verified-media-image";

/** Gli identificativi viaggiano come stringhe nei contratti; le immagini vogliono un numero. */
export function numericId(value: string): number | null {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

type LeagueIdentityProps = Readonly<{
  leagueId: number | null;
  name: string | null;
  /** Sigla di tre lettere del paese: assente quando il paese non è in tabella. */
  code: string | null;
  size?: "sm" | "md";
}>;

/**
 * L'identità di una competizione in un blocco solo: stemma, nome, sigla del paese.
 * Lo stemma è decorativo — il nome resta sempre scritto — e sparisce da sé quando la
 * fonte non ha l'immagine, senza lasciare un buco.
 */
export function LeagueIdentity({ leagueId, name, code, size = "md" }: LeagueIdentityProps) {
  const side = size === "sm" ? 20 : 24;
  return (
    <span className={"league-id league-id-".concat(size)}>
      {leagueId === null ? null : (
        <span className="league-id-crest" aria-hidden="true">
          <VerifiedMediaImage
            src={"/api/media/league/".concat(String(leagueId))}
            className="league-id-img"
            width={side}
            height={side}
          />
        </span>
      )}
      <span className="league-id-name">{name ?? "Competizione non identificata"}</span>
      {code ? <i className="league-id-code">({code})</i> : null}
    </span>
  );
}
