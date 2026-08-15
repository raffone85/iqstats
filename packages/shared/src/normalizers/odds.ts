import type { DataEnvelope, FieldValue } from "../contracts/common.ts";
import type {
  OddsCollection,
  OddsMarket,
  OddsMovement,
  OddsOutcome,
  OddsSnapshot,
} from "../contracts/odds.ts";
import {
  available,
  booleanValue,
  finiteInteger,
  finiteNumber,
  isRecord,
  isoDateTime,
  makeAvailability,
  makeCoverage,
  makeProvenance,
  nonEmptyString,
  stringId,
  unavailable,
} from "./common.ts";

export interface OddsNormalizationContext {
  readonly matchId: string;
  readonly capturedAt: string;
}

const markets = new Set<OddsMarket>([
  "1x2",
  "btts",
  "over_under_15",
  "over_under_25",
  "over_under_35",
  "double_chance",
  "draw_no_bet",
  "total_corners",
  "corners_1x2",
  "total_red_cards",
  "red_card",
]);

const outcomes = new Set<OddsOutcome>([
  "HOME",
  "DRAW",
  "AWAY",
  "over",
  "under",
  "yes",
  "no",
  "1X",
  "12",
  "X2",
]);

function oddsMarket(value: unknown): OddsMarket | null {
  const text = nonEmptyString(value) as OddsMarket | null;
  return text && markets.has(text) ? text : null;
}

function oddsOutcome(value: unknown): OddsOutcome | null {
  const text = nonEmptyString(value) as OddsOutcome | null;
  return text && outcomes.has(text) ? text : null;
}

function movement(value: unknown): FieldValue<OddsMovement> {
  if (value === "SHORTENING") return available("shortening");
  if (value === "DRIFTING") return available("drifting");
  if (value === "") return available("unchanged");
  return unavailable("validation_failed");
}

function numberField(value: unknown): FieldValue<number> {
  const number = finiteNumber(value);
  return number === null ? unavailable("not_captured") : available(number);
}

function booleanField(value: unknown): FieldValue<boolean> {
  const boolean = booleanValue(value);
  return boolean === null ? unavailable("not_captured") : available(boolean);
}

function normalizeRow(
  raw: unknown,
  context: OddsNormalizationContext,
): OddsSnapshot | null {
  if (!isRecord(raw)) return null;
  const id = stringId(raw.id);
  const market = oddsMarket(raw.market);
  const outcome = oddsOutcome(raw.outcome);
  const bookmakerId = nonEmptyString(raw.bookmaker_slug);
  const bookmakerName = nonEmptyString(raw.bookmaker_name);
  const currentDecimalOdds = finiteNumber(raw.decimal_odds);
  if (
    !id ||
    !market ||
    !outcome ||
    !bookmakerId ||
    !bookmakerName ||
    currentDecimalOdds === null
  ) {
    return null;
  }

  const updatedAt = isoDateTime(raw.updated_at);
  const missingFields: string[] = [];
  if (finiteNumber(raw.implied_probability) === null) missingFields.push("impliedProbability");
  if (booleanValue(raw.is_max_quote) === null) missingFields.push("bestPrice");
  if (!updatedAt) missingFields.push("updatedAt");

  return {
    id,
    matchId: context.matchId,
    market,
    outcome,
    line: finiteNumber(raw.line),
    outcomeName: nonEmptyString(raw.outcome_name),
    bookmaker: { id: bookmakerId, name: bookmakerName },
    currentDecimalOdds: available(currentDecimalOdds),
    previousDecimalOdds: numberField(raw.previous_decimal_odds),
    openingDecimalOdds: unavailable("not_exposed_by_source"),
    closingDecimalOdds: unavailable("not_exposed_by_source"),
    impliedProbability: numberField(raw.implied_probability),
    movement: movement(raw.movement),
    bestPrice: booleanField(raw.is_max_quote),
    updatedAt: updatedAt ? available(updatedAt) : unavailable("validation_failed"),
    availability: makeAvailability(
      missingFields.length === 0 ? "available" : "partial",
      missingFields.length === 0 ? null : "not_captured",
      missingFields,
    ),
    provenance: makeProvenance(context.capturedAt, updatedAt),
  };
}

export function normalizeOddsPages(
  payloads: readonly unknown[],
  context: OddsNormalizationContext,
): DataEnvelope<OddsCollection> {
  const provenance = makeProvenance(context.capturedAt);
  const rawRows: unknown[] = [];
  const declaredTotals = new Set<number>();
  const missingFields: string[] = [];

  payloads.forEach((payload, pageIndex) => {
    if (!isRecord(payload) || !Array.isArray(payload.results)) {
      missingFields.push(`pages[${pageIndex}].results`);
      return;
    }
    rawRows.push(...payload.results);
    const declared = finiteInteger(payload.count);
    if (declared !== null) declaredTotals.add(declared);
  });

  if (rawRows.length === 0 && missingFields.length > 0) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", missingFields),
      provenance,
      calculation: null,
    };
  }

  const normalized: OddsSnapshot[] = [];
  const seen = new Set<string>();
  rawRows.forEach((raw, index) => {
    const row = normalizeRow(raw, context);
    if (!row) {
      missingFields.push(`odds[${index}]`);
      return;
    }
    if (seen.has(row.id)) {
      missingFields.push(`odds[${index}].duplicateId`);
      return;
    }
    seen.add(row.id);
    normalized.push(row);
  });

  if (declaredTotals.size > 1) missingFields.push("count");
  const declaredTotal = declaredTotals.size === 1 ? [...declaredTotals][0] ?? null : null;
  if (declaredTotal !== null && declaredTotal !== normalized.length) {
    missingFields.push("pagination");
  }

  const uniqueMarkets = [...new Set(normalized.map((row) => row.market))];
  const expectedTotal = declaredTotal ?? rawRows.length;
  const complete =
    missingFields.length === 0 &&
    (declaredTotal === null || declaredTotal === normalized.length);

  return {
    data: {
      matchId: context.matchId,
      items: normalized,
      markets: uniqueMarkets,
      declaredTotal,
    },
    availability: makeAvailability(
      complete ? "available" : "partial",
      complete ? null : "insufficient_coverage",
      missingFields,
      makeCoverage(normalized.length, expectedTotal),
    ),
    provenance,
    calculation: null,
  };
}
