// Prove della matematica del valore: de-margine e punti sopra il prezzo. Nessuna connessione.
import assert from "node:assert/strict";
import test from "node:test";

import { EDGE_MINIMO } from "../src/server/iqstats/eventi-di-valore.ts";
import { TETTO_VALORE } from "../src/server/iqstats/projection/valore.ts";
import {
  implicitaSoglia,
  probabilitaCombinata,
  valoreSoglia,
} from "../src/server/iqstats/projection/valore.ts";

test("la soglia di valore è +5", () => {
  assert.equal(EDGE_MINIMO, 5);
});

test("valoreSoglia toglie il margine dai due lati e dà i punti sopra il prezzo", () => {
  // Over 1,50 e Under 2,50: implicite grezze 66,7% e 40%, somma 106,7% (margine 6,7).
  // Ripulita: 66,7/106,7 = 62,5%. Noi al 73%, combinati con il prezzo: 66,3% → +4.
  assert.equal(valoreSoglia(0.73, 1.5, 2.5), 4);
});

test("implicitaSoglia con due lati toglie il margine", () => {
  const i = implicitaSoglia(1.5, 2.5);
  assert.ok(i !== null && Math.abs(i - 0.625) < 1e-9);
});

test("con un lato solo usa la quota grezza: 1/quota, margine incluso", () => {
  // Over 1,50 senza l'Under: implicita grezza 1/1,50 = 66,7%. Noi al 73%, combinati: +3.
  assert.equal(implicitaSoglia(1.5, null), 1 / 1.5);
  assert.equal(valoreSoglia(0.73, 1.5, null), 3);
});

test("valore e implicita sono null solo senza la quota del lato", () => {
  assert.equal(valoreSoglia(0.73, null, 2.5), null);
  assert.equal(implicitaSoglia(null, 2.5), null);
});

test("valoreSoglia può essere negativo: il prezzo dà di più", () => {
  const v = valoreSoglia(0.6, 1.1, 6.0);
  assert.ok(v !== null && v < 0);
});

test("la quota del lato non valida dà null; l'altra non valida ripiega su grezza", () => {
  assert.equal(valoreSoglia(0.7, 0, 2.0), null);          // il lato non ha un prezzo valido
  assert.equal(valoreSoglia(0.7, 1.5, -1), 2);            // l'altro non vale: grezza 1/1,5
});

test("il tetto scarta i valori non credibili: sopra +15 niente evento", () => {
  assert.equal(TETTO_VALORE, 15);
  // Con la probabilità combinata il tetto si raggiunge solo da lontano: noi al 99% contro una
  // quota 3,30 sono +35, fuori dagli eventi (filtro di eventiDiValore).
  assert.ok(valoreSoglia(0.99, 3.3, null)! > TETTO_VALORE);
});

test("la combinata sta fra noi e il prezzo, e il pari resta pari", () => {
  // Misurato l'8 ottobre 2026: il motore pesa circa un quarto, il prezzo il resto.
  const p = probabilitaCombinata(0.73, 0.625);
  assert.ok(p > 0.625 && p < 0.73);
  assert.ok(Math.abs(probabilitaCombinata(0.5, 0.5) - 0.5) < 0.01);
  assert.ok(valoreSoglia(0.5, 2, 2) === 0); // -0 compreso: testoValore lo scrive «senza valore»
});
