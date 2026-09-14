// Prove della riga in parole semplici. Nessuna connessione: è aritmetica e testo.
import assert from "node:assert/strict";
import test from "node:test";

import {
  etichettaPreliminare,
  etichettaSenzaQuote,
  letturaSemplice,
  percheDellaLettura,
} from "../src/components/match-projection-lettura.ts";

// Casi veri dall'artefatto del 14 settembre 2026: Como-Parma e Gaziantep-Fenerbahçe.
test("il perché dice il campionato, chi spinge e chi frena, con le squadre", () => {
  const f = percheDellaLettura({
    probabilita: 0.6344, base: 32.35, lato: "casa", verso: "Over", chi: "Como", altro: "Parma",
    cause: [
      { nome: "la classifica", effetto: 0.187 },
      { nome: "il fattore campo", effetto: 0.083 },
      { nome: "gli undici", effetto: -0.022 },
    ],
  });
  assert.equal(f, "Diamo 63%, nel campionato succede nel 32% delle gare. A spingere il numero: "
    + "la posizione in classifica (+19%) e giocare in casa (+8%). Frena la formazione attesa (−2%).");
});

test("se tutte le cause frenano non le spaccia per il motivo", () => {
  const f = percheDellaLettura({
    probabilita: 0.7894, base: 63.41, lato: "casa", verso: "Over", chi: "Gaziantep", altro: "Fenerbahçe",
    cause: [
      { nome: "il fattore campo", effetto: -0.056 },
      { nome: "il livello della squadra", effetto: -0.033 },
    ],
  });
  assert.equal(f, "Diamo 79%, nel campionato succede nel 63% delle gare, nonostante giocare in casa "
    + "(−6%) e il rendimento abituale di Gaziantep (−3%) vadano nel verso opposto.");
});

test("sull'Under un effetto negativo è a favore, e l'avversaria ha il suo nome", () => {
  const f = percheDellaLettura({
    probabilita: 0.61, base: null, lato: "trasferta", verso: "Under", chi: "Roma", altro: "Torino",
    cause: [{ nome: "quanto concede l'avversario", effetto: -0.07 }],
  });
  // Senza base la probabilità non si ripete: negli eventi di valore sta già nella riga sopra.
  assert.equal(f, "A spingere il numero: quanto concede Torino (−7%).");
  assert.equal(percheDellaLettura({
    probabilita: 0.6, base: null, lato: "casa", verso: "Over", chi: "A", altro: "B",
    cause: [{ nome: "il fattore campo", effetto: -0.05 }],
  }), "La causa del modello va nel verso opposto: giocare in casa (−5%).");
});

test("senza cause, sotto un ripiego, non c'è un perché", () => {
  assert.equal(percheDellaLettura({
    probabilita: 0.6, base: 50, lato: "totale", verso: "Over", chi: "A", altro: "B", cause: [],
  }), null);
});

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

test("famiglia dell'arbitro senza designazione: la nota nomina l'arbitro", () => {
  const t = etichettaPreliminare(true, false);
  assert.match(t, /arbitro non è ancora designato/);
  assert.match(t, /scaletta Over\/Under e l’affidabilità arrivano con la designazione/);
});

test("ripiego non legato all'arbitro: nota generica, senza nominarlo", () => {
  const t = etichettaPreliminare(false, false);
  assert.match(t, /manca un ingresso per questa gara/);
  assert.doesNotMatch(t, /arbitro/);
});

test("famiglia dell'arbitro ma arbitro designato: nota generica, non lo si incolpa", () => {
  const t = etichettaPreliminare(true, true);
  assert.doesNotMatch(t, /arbitro/);
});

test("la nota senza-quote nomina la famiglia in minuscolo e dichiara che resta la probabilità", () => {
  const t = etichettaSenzaQuote("Tiri in porta");
  assert.equal(
    t,
    "Il banco non apre linee di tiri in porta su questa gara: resta la nostra probabilità, "
      + "senza un prezzo accanto.",
  );
});
