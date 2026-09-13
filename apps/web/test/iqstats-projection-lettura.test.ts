// Prove della riga in parole semplici. Nessuna connessione: è aritmetica e testo.
import assert from "node:assert/strict";
import test from "node:test";

import { letturaSemplice } from "../src/components/match-projection-lettura.ts";

test("dichiara il totale e chi è avanti quando lo scarto è netto", () => {
  const f = letturaSemplice("total_shots", "Atalanta", "Napoli", 14.6, 11.5, 26.1);
  assert.equal(f, "Circa 26 tiri attesi. Avanti Atalanta.");
});

test("l'avanti è la trasferta quando è lei ad avere il numero più alto", () => {
  const f = letturaSemplice("corner_kicks", "Atalanta", "Napoli", 4, 7, 11);
  assert.equal(f, "Circa 11 corner attesi. Avanti Napoli.");
});

test("sotto il 15% di scarto dichiara equilibrio, non un leader", () => {
  const f = letturaSemplice("fouls", "Atalanta", "Napoli", 12.5, 12.3, 24.8);
  assert.equal(f, "Circa 25 falli attesi, equilibrio fra le due.");
});

test("le parate concordano al femminile: attese, non attesi", () => {
  const f = letturaSemplice("goalkeeper_saves", "Atalanta", "Napoli", 4, 3, 6.4);
  assert.equal(f, "Circa 6 parate attese. Avanti Atalanta.");
});

test("quando i due arrotondati coincidono è equilibrio, non «1 contro 1»", () => {
  const f = letturaSemplice("offsides", "Atalanta", "Napoli", 1.4, 1.1, 2.6);
  assert.equal(f, "Circa 3 fuorigioco attesi, equilibrio fra le due.");
});

test("senza il totale lo somma dai due lati, non lo inventa", () => {
  const f = letturaSemplice("offsides", "Atalanta", "Napoli", 2, 3, null);
  assert.equal(f, "Circa 5 fuorigioco attesi. Avanti Napoli.");
});

test("un bersaglio fuori dalle sette famiglie non ha frase", () => {
  assert.equal(letturaSemplice("expected_goals", "Atalanta", "Napoli", 1.6, 1.2, 2.8), null);
});

test("un atteso non finito non produce una frase con NaN", () => {
  assert.equal(letturaSemplice("total_shots", "Atalanta", "Napoli", Number.NaN, 11.5, null), null);
});
