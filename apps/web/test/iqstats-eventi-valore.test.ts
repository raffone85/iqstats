// Prove della matematica del valore: de-margine e punti sopra il prezzo. Nessuna connessione.
import assert from "node:assert/strict";
import test from "node:test";

import { EDGE_MINIMO } from "../src/server/iqstats/eventi-di-valore.ts";
import { implicitaSoglia, valoreSoglia } from "../src/server/iqstats/projection/valore.ts";

test("la soglia di valore è +5", () => {
  assert.equal(EDGE_MINIMO, 5);
});

test("valoreSoglia toglie il margine dai due lati e dà i punti sopra il prezzo", () => {
  // Over 1,50 e Under 2,50: implicite grezze 66,7% e 40%, somma 106,7% (margine 6,7).
  // Ripulita: 66,7/106,7 = 62,5%. Con noi al 73% → +10,5, che in floating point arrotonda a 10.
  assert.equal(valoreSoglia(0.73, 1.5, 2.5), 10);
});

test("implicitaSoglia è la probabilità del prezzo ripulita dal margine", () => {
  const i = implicitaSoglia(1.5, 2.5);
  assert.ok(i !== null && Math.abs(i - 0.625) < 1e-9);
});

test("valore e implicita sono null senza una delle due quote", () => {
  assert.equal(valoreSoglia(0.73, null, 2.5), null);
  assert.equal(valoreSoglia(0.73, 1.5, null), null);
  assert.equal(implicitaSoglia(null, 2.5), null);
});

test("valoreSoglia può essere negativo: il prezzo dà di più", () => {
  const v = valoreSoglia(0.6, 1.1, 6.0);
  assert.ok(v !== null && v < 0);
});

test("una quota non valida non produce un valore", () => {
  assert.equal(valoreSoglia(0.7, 0, 2.0), null);
  assert.equal(valoreSoglia(0.7, 1.5, -1), null);
});
