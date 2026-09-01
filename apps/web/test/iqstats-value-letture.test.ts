import assert from "node:assert/strict";
import test from "node:test";

import { valueDelleQuote, valueSopraSoglia } from "../src/server/iqstats/value-letture.ts";
import type { MarketRow } from "../src/server/iqstats/match-reading.ts";

test("l'edge e' p per quota meno uno, e le voci senza quota restano fuori", () => {
  const righe: MarketRow[] = [
    { label: "Over 2.5", model: 60, market: 50, odds: 2.0, moving: false },
    { label: "Senza quota", model: 70, market: 40, odds: null, moving: false },
  ];
  const voci = valueDelleQuote(righe);
  assert.equal(voci.length, 1);
  assert.equal(voci[0].etichetta, "Over 2.5");
  assert.ok(Math.abs(voci[0].edge - 0.2) < 1e-12);
  assert.equal(valueSopraSoglia(voci).length, 1);
});
