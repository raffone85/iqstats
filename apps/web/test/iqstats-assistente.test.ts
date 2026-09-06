// Prove dell'assistente. Niente connessione: si verifica cio' che decide la risposta prima
// che il livello dati entri in gioco, cioe' che nome resta dalla domanda.
//
// Il resto - i numeri - non ha bisogno di prove qui: l'assistente non ne calcola nessuno,
// li prende da `profiloArbitro` e `profiloSquadra`, che hanno gia' le loro.
import assert from "node:assert/strict";
import test from "node:test";

import { nomeCercato } from "../src/server/iqstats/assistente.ts";

test("dalla domanda resta il nome, non le parole di servizio", () => {
  assert.equal(nomeCercato("come sta il Napoli"), "napoli");
  assert.equal(nomeCercato("Dimmi le statistiche del Bayern Monaco"), "bayern monaco");
  assert.equal(nomeCercato("come arbitra Maresca?"), "maresca");
  assert.equal(nomeCercato("quanti falli fischia Orsato"), "orsato");
});

test("i nomi dei bersagli non entrano nel nome cercato", () => {
  // «falli orsato» non trova nessuno: sono parole del dominio, non nomi propri. Trovato
  // provando domande vere, e questa prova impedisce che tornino dentro.
  assert.equal(nomeCercato("quanti cartellini gialli da' Maresca"), "maresca");
  assert.equal(nomeCercato("quanti corner fa il Milan"), "milan");
});

test("gli accenti e la punteggiatura non cambiano il nome", () => {
  assert.equal(nomeCercato("come sta l'Atlético?"), "atletico");
  assert.equal(nomeCercato("BESIKTAS!!!"), "besiktas");
});

test("una domanda fatta di sole parole di servizio non lascia un nome", () => {
  // Senza questo, «come sta la squadra» cercherebbe la stringa vuota e trovherebbe tutto.
  assert.equal(nomeCercato("come sta la squadra"), "");
  assert.equal(nomeCercato("dimmi i numeri"), "");
});
