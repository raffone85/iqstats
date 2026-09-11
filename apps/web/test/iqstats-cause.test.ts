// Le cause di un numero: raggruppamento, conversione, taglio.
//
// Il caso che conta e' quello misurato sulla gara 213568 dell'11 settembre 2026, dove
// `arbitro_campione` (+1,462) e `arbitro_gare_viste` (-1,261) avevano lo stesso valore
// grezzo e, elencate separate, sarebbero state le due cause piu' grandi della gara.
import assert from "node:assert/strict";
import test from "node:test";

import { causeDellaLettura } from "../src/server/iqstats/projection/cause.ts";
import type { EsitoDiProduzione } from "../src/server/iqstats/projection/production.ts";

function lato(
  contributi: ReadonlyArray<{ nome: string; contributo: number }> | null,
  eta: number,
  collegamento: "log" | "identita",
  valoreAtteso = eta,
): EsitoDiProduzione {
  return {
    stato: "prevista",
    target: "fouls",
    modelId: "fouls__ridge",
    modelVersion: "1",
    valoreAtteso,
    intervallo: null,
    contributi,
    predittoreLineare: eta,
    collegamento,
    origineDelValore: "modello",
    pesoDelModello: 1,
    ripiegoUsato: false,
    copertura: "piena",
    campioneDiAddestramento: 1000,
    evidenze: {} as EsitoDiProduzione extends { evidenze: infer E } ? E : never,
  };
}

test("le feature di campione non diventano cause", () => {
  const casa = lato([
    { nome: "gare_precedenti", contributo: -1.06 },
    { nome: "prodotto_stagione_campione", contributo: 0.68 },
    { nome: "avv_concesso_lato_media", contributo: 1.1 },
  ], 10, "identita");
  const cause = causeDellaLettura("casa", casa, casa);
  assert.deepEqual(cause.map((c) => c.nome), ["quanto concede l'avversario"]);
  assert.equal(cause[0].effetto.toFixed(2), "0.11");
});

test("le due collineari dell'arbitro si sommano invece di contarsi due volte", () => {
  const casa = lato([
    { nome: "arbitro_severita_falli", contributo: 0.311 },
    { nome: "arbitro_scarto_dalla_lega", contributo: 0.311 },
    { nome: "concesso_ewma", contributo: -2 },
  ], 10, "identita");
  const cause = causeDellaLettura("casa", casa, casa);
  const arbitro = cause.find((c) => c.nome === "l'arbitro");
  assert.ok(arbitro !== undefined);
  // 0,311 + 0,311 su un predittore di 10: una causa sola da 6,2%, non due da 3,1%.
  assert.equal(arbitro.effetto.toFixed(3), "0.062");
});

test("l'avversario che concede non finisce fra quello che la squadra subisce", () => {
  const casa = lato([
    { nome: "avv_concesso_stagione_media", contributo: 1 },
    { nome: "concesso_stagione_media", contributo: -1 },
  ], 10, "identita");
  const cause = causeDellaLettura("casa", casa, casa);
  assert.deepEqual(
    [...cause].sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => c.nome),
    ["quanto concede l'avversario", "quanto subisce la squadra"],
  );
});

test("sul collegamento logaritmico l'effetto e' moltiplicativo, non una quota di eta", () => {
  const casa = lato([{ nome: "classifica_delta_punti", contributo: Math.log(1.2) }], 2, "log");
  const cause = causeDellaLettura("casa", casa, casa);
  assert.equal(cause[0].effetto.toFixed(3), "0.200");
});

test("sul totale gli effetti si pesano sull'atteso dei due lati, non si sommano", () => {
  const casa = lato([{ nome: "classifica_punti_media", contributo: Math.log(1.5) }], 1, "log", 3);
  const fuori = lato([{ nome: "classifica_punti_media", contributo: 0 }], 1, "log", 1);
  const cause = causeDellaLettura("totale", casa, fuori);
  // +50% su un lato che vale 3, niente su uno che vale 1: sul totale e' 3/4 di 50%.
  assert.equal(cause[0].effetto.toFixed(3), "0.375");
});

test("sotto un ripiego non si attribuisce nessuna causa", () => {
  const senza = lato(null, 10, "identita");
  assert.deepEqual(causeDellaLettura("casa", senza, senza), []);
});
