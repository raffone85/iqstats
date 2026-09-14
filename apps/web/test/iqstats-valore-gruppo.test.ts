// Il valore sui mercati dei gol: 1X2 a tre esiti, doppia chance che copre due casi su tre,
// multigol senza lato opposto. Stessa regola delle soglie delle famiglie.
import assert from "node:assert/strict";
import test from "node:test";

import {
  implicitaInGruppo,
  implicitaSoglia,
  testoValore,
  valoreInGruppo,
} from "../src/server/iqstats/projection/valore.ts";

test("su una coppia coincide con la soglia delle famiglie", () => {
  assert.equal(implicitaInGruppo(1.8, [1.8, 2.1]), implicitaSoglia(1.8, 2.1));
  assert.equal(implicitaInGruppo(1.8, [1.8, null]), implicitaSoglia(1.8, null));
});

test("l'1X2 toglie il margine sui tre esiti", () => {
  const somma = [2.2, 3.3, 3.4].reduce((s, q) => s + implicitaInGruppo(q, [2.2, 3.3, 3.4])!, 0);
  assert.ok(Math.abs(somma - 1) < 1e-9);
});

test("la doppia chance somma a due, non a uno", () => {
  const somma = [1.33, 1.62, 1.3].reduce((s, q) => s + implicitaInGruppo(q, [1.33, 1.62, 1.3], 2)!, 0);
  assert.ok(Math.abs(somma - 2) < 1e-9);
});

test("il multigol da solo usa la quota grezza, e senza quota non c'e' valore", () => {
  assert.equal(valoreInGruppo(0.5, 2.5, [2.5]), 10);
  assert.equal(valoreInGruppo(0.5, null, [null]), null);
});

test("il verdetto ha una frase sola", () => {
  assert.equal(testoValore(6), "valore +6");
  assert.equal(testoValore(0), "senza valore");
  assert.equal(testoValore(16), "valore non valutabile");
});
