import type {
  DataAvailability,
  DataProvenance,
  FieldValue,
} from "./common.ts";

export type OddsMarket =
  | "1x2"
  | "btts"
  | "over_under_15"
  | "over_under_25"
  | "over_under_35"
  | "double_chance"
  | "draw_no_bet"
  | "total_corners"
  | "corners_1x2"
  | "total_red_cards"
  | "red_card";

export type OddsOutcome =
  | "HOME"
  | "DRAW"
  | "AWAY"
  | "over"
  | "under"
  | "yes"
  | "no"
  | "1X"
  | "12"
  | "X2";

export type OddsMovement = "shortening" | "drifting" | "unchanged";

export interface BookmakerSummary {
  readonly id: string;
  readonly name: string;
}

export interface OddsSnapshot {
  readonly id: string;
  readonly matchId: string;
  readonly market: OddsMarket;
  readonly outcome: OddsOutcome;
  readonly line: number | null;
  readonly outcomeName: string | null;
  readonly bookmaker: BookmakerSummary;
  readonly currentDecimalOdds: FieldValue<number>;
  readonly previousDecimalOdds: FieldValue<number>;
  readonly openingDecimalOdds: FieldValue<number>;
  readonly closingDecimalOdds: FieldValue<number>;
  readonly impliedProbability: FieldValue<number>;
  readonly movement: FieldValue<OddsMovement>;
  readonly bestPrice: FieldValue<boolean>;
  readonly updatedAt: FieldValue<string>;
  readonly availability: DataAvailability;
  readonly provenance: DataProvenance;
}

export interface OddsCollection {
  readonly matchId: string;
  readonly items: readonly OddsSnapshot[];
  readonly markets: readonly OddsMarket[];
  readonly declaredTotal: number | null;
}
