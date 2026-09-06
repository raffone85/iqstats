import type { PlayerMetricKey, TeamSquadMember } from "./team.ts";

/**
 * Anagrafica di `players/{id}/`. I campi derivati della fonte — `rating`, `potential`,
 * `injury_risk`, `market_value_eur`, `wage_eur_annual` — restano fuori dal contratto:
 * sono numeri calcolati con un metodo che non conosciamo, e accanto ai nostri
 * passerebbero per nostri (`docs/product/copertura-giocatori.md` §6).
 */
export interface PlayerProfile extends TeamSquadMember {
  /** Ruolo stretto dichiarato dalla fonte, per esempio `RW`. Non è una nostra misura. */
  readonly specificPosition: string | null;
  readonly heightCm: number | null;
  readonly preferredFoot: string | null;
  readonly contractUntil: string | null;
  readonly currentTeam: { readonly id: string; readonly name: string } | null;
  /** `available` oppure `injured`, con il tipo di infortunio e il rientro atteso. */
  readonly availabilityStatus: string | null;
  readonly injuryType: string | null;
  readonly injuryExpectedReturn: string | null;
}

/**
 * Totali di un insieme di gare del giocatore. `rows` sono le righe lette e `declared`
 * quelle che la fonte dichiara: sotto il tetto di pagina i due numeri coincidono, sopra
 * il blocco è parziale e lo dice.
 */
export interface PlayerStatsBlock {
  readonly rows: number;
  readonly declared: number;
  /** Gare con almeno un minuto giocato: le altre sono panchina, dove zero è il valore vero. */
  readonly appearances: number;
  readonly minutes: number;
  /** Squadre che compaiono nelle righe lette, dalla più presente. */
  readonly teams: readonly { readonly teamId: string; readonly rows: number }[];
  /** Somme; `null` quando nessuna riga espone la metrica. */
  readonly totals: Readonly<Record<PlayerMetricKey, number | null>>;
}
