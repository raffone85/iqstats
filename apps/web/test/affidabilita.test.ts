// Prove della scala di affidabilita'.
//
// Sorvegliano i bordi, che sono l'unica cosa che si puo' sbagliare qui: una soglia
// spostata di una gara cambia l'etichetta di intere giornate di campionato.
import assert from "node:assert/strict";
import test from "node:test";

import { affidabilita, SOGLIA_MINIMA } from "../src/lib/affidabilita.ts";

test("sotto la soglia minima non c'e' etichetta, perche' non c'e' sezione", () => {
  assert.equal(affidabilita(0), null);
  assert.equal(affidabilita(3), null);
});

test("i tre gradini cominciano dove devono", () => {
  assert.equal(affidabilita(SOGLIA_MINIMA), "affidabilità bassa");
  assert.equal(affidabilita(9), "affidabilità bassa");
  assert.equal(affidabilita(10), "affidabilità medio-alta");
  assert.equal(affidabilita(14), "affidabilità medio-alta");
  assert.equal(affidabilita(15), "statistica solida");
});

test("oltre la quindicesima non si aggiungono gradini", () => {
  // La curva dell'errore e' piatta: 1,08 punti a 15 gare, 0,83 a 20. Promettere di piu'
  // a 40 gare direbbe una differenza che i numeri non fanno.
  assert.equal(affidabilita(40), affidabilita(15));
  assert.equal(affidabilita(400), "statistica solida");
});
