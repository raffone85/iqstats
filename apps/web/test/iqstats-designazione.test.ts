// Prove dell'avviso «arbitro non designato»: pure, senza livello dati e senza fonte.
//
// Quello che verificano non e' il testo ma le due regole che, se saltassero, metterebbero in
// testata una promessa che non possiamo mantenere: a gara lontana si dice che il designato
// arrivera', a ridosso del calcio d'inizio non lo si dice, e i giorni scritti sono quelli
// che mancano davvero.
import assert from "node:assert/strict";
import test from "node:test";

import { avvisoSenzaArbitro } from "../src/server/iqstats/designazione.ts";

const ADESSO = new Date("2026-08-29T05:00:00Z");

/** L'orario ISO di una gara fra `ore` ore. */
function fra(ore: number): string {
  return new Date(ADESSO.getTime() + ore * 3_600_000).toISOString();
}

test("gara lontana: dice quando la fonte dichiarera' il designato", () => {
  // Remo-Corinthians del 2 dicembre 2026: la gara su cui il difetto e' stato visto.
  const avviso = avvisoSenzaArbitro("2026-12-02T18:00:00+00:00", ADESSO);
  assert.equal(avviso.titolo, "non ancora designato");
  assert.match(avviso.riga, /entro le ventiquattro ore prima del calcio d'inizio/);
});

test("la promessa vale fino al giorno prima, e non un'ora di piu'", () => {
  // A venticinque ore la designazione e' ancora attesa; a ventiquattro la promessa e'
  // scaduta e la pagina smette di farla.
  assert.equal(avvisoSenzaArbitro(fra(25), ADESSO).titolo, "non ancora designato");
  assert.equal(avvisoSenzaArbitro(fra(24), ADESSO).titolo, "non dichiarato dalla fonte");
});

test("gara vicina: nessuna promessa di designazione", () => {
  // Dentro le ventiquattro ore un arbitro che manca non e' «in arrivo»: e' la fonte che
  // non lo espone, e prometterlo sarebbe una promessa gia' scaduta.
  for (const ore of [24, 6, 2, 0.5]) {
    const avviso = avvisoSenzaArbitro(fra(ore), ADESSO);
    assert.equal(avviso.titolo, "non dichiarato dalla fonte", `a ${ore} ore`);
    assert.doesNotMatch(avviso.riga, /ventiquattro|dichiara /, `a ${ore} ore`);
  }
});

test("gara gia' iniziata o orario illeggibile: la stessa frase, senza promesse", () => {
  assert.equal(avvisoSenzaArbitro(fra(-3), ADESSO).titolo, "non dichiarato dalla fonte");
  assert.equal(avvisoSenzaArbitro("", ADESSO).titolo, "non dichiarato dalla fonte");
  assert.equal(avvisoSenzaArbitro("non una data", ADESSO).titolo, "non dichiarato dalla fonte");
});

test("il titolo non ripete la parola che l'etichetta accanto scrive gia'", () => {
  // In testata l'etichetta dice «Arbitro»: un titolo che la ripete la scrive due volte.
  for (const kickoff of [fra(200), fra(3)]) {
    assert.doesNotMatch(avvisoSenzaArbitro(kickoff, ADESSO).titolo, /[Aa]rbitro/);
  }
});
