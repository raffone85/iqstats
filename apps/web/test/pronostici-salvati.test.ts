import assert from "node:assert/strict";
import { test } from "node:test";

import { conScheda, schedeSalvate, type SchedaSalvata } from "../src/lib/pronostici-salvati.ts";

const scheda = (gara: number, salvata: string): SchedaSalvata => ({
  gara, casa: "Monza", trasferta: "Sassuolo", lega: "Serie B",
  inizio: "2026-10-10T13:00:00Z", salvata,
  pronostico: { titolo: "Over 8,5 calci d'angolo", chi: "Totale gara", percento: 72 },
  elenco: "Gli altri consigli",
  eventi: [{ titolo: "1-3 · Multigol", chi: null, percento: 68 }],
});

test("la memoria del browser non e' fidata: quello che non ha la forma si scarta", () => {
  assert.deepEqual(schedeSalvate("non json"), []);
  assert.deepEqual(schedeSalvate("{}"), []);
  const buona = scheda(1, "2026-10-09T08:00:00Z");
  const letto = schedeSalvate(JSON.stringify([
    buona,
    { gara: "2" },
    { ...buona, gara: 3, pronostico: { titolo: 4 }, eventi: [{ titolo: "x" }, buona.eventi[0]] },
  ]));
  assert.deepEqual(letto[0], buona);
  assert.equal(letto.length, 2);
  assert.equal(letto[1].pronostico, null);
  assert.deepEqual(letto[1].eventi, buona.eventi);
});

test("una scheda per gara, la piu' recente in cima, non piu' di cinquanta", () => {
  const prima = [scheda(1, "a"), scheda(2, "b")];
  const dopo = conScheda(prima, scheda(2, "c"));
  assert.deepEqual(dopo.map((s) => [s.gara, s.salvata]), [[2, "c"], [1, "a"]]);
  let tante: readonly SchedaSalvata[] = [];
  for (let i = 0; i < 60; i += 1) tante = conScheda(tante, scheda(i, "x"));
  assert.equal(tante.length, 50);
  assert.equal(tante[0].gara, 59);
});
