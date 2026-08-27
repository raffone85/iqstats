// Il criterio della home: quanto una lettura si stacca dalla media di quel mercato.
//
// La funzione e' pura, quindi qui non serve nessuna connessione: le medie si passano a
// mano ed e' proprio il punto, perche' cosi' si puo' costruire il caso che smonta
// l'ordinamento per percentuale.
import assert from "node:assert/strict";
import test from "node:test";

import { sbilanciDelGiorno, type MedieDiMercato } from "../src/server/iqstats/sbilanci.ts";
import type { DashboardPrediction } from "../src/server/iqstats/predictions.ts";

/** Le medie vere misurate sulle nostre osservazioni, 9.118 gare degli ultimi 365 giorni. */
const MEDIE: MedieDiMercato = {
  gare: 9118, casa: 44.5, pari: 26.5, trasferta: 29.0, over25: 50.9, gg: 53.4,
};

function gara(campi: Partial<DashboardPrediction> & { eventId: number }): DashboardPrediction {
  return {
    kickoff: "2026-08-24T18:00:00Z", status: "notstarted",
    leagueId: 1, leagueName: "Prova", homeTeamId: 1, awayTeamId: 2,
    homeTeam: "Casa", awayTeam: "Ospite",
    probHome: null, probDraw: null, probAway: null, predicted: null,
    xgHome: null, xgAway: null, probOver25: null, probBtts: null,
    mostLikelyScore: null, favorite: null, favoriteProb: null,
    modelVersion: null, createdAt: null,
    ...campi,
  };
}

test("la percentuale piu' alta non vince: vince quella piu' staccata dalla media", () => {
  // Casa al 54% sta +9,5 sopra il 44,5% di media. Trasferta al 45% sta +16,0 sopra il
  // 29,0%. La seconda ha la percentuale piu' bassa e la lettura piu' decisa: se un giorno
  // qualcuno ordinasse per probabilita', questa prova diventa rossa.
  const righe = sbilanciDelGiorno([
    gara({ eventId: 1, homeTeam: "Alfa", awayTeam: "Beta", probHome: 54 }),
    gara({ eventId: 2, homeTeam: "Gamma", awayTeam: "Delta", probAway: 45 }),
  ], MEDIE, 6);

  assert.equal(righe.length, 2);
  assert.equal(righe[0].eventId, 2, "in cima e' finita la percentuale piu' alta, non la piu' staccata");
  assert.equal(righe[0].mercato, "Trasferta");
  assert.ok(Math.abs(righe[0].scarto - 16.0) < 1e-9, `scarto ${righe[0].scarto}`);
  assert.ok(Math.abs(righe[1].scarto - 9.5) < 1e-9, `scarto ${righe[1].scarto}`);
});

test("una gara entra una volta sola, con il suo mercato piu' staccato", () => {
  const righe = sbilanciDelGiorno([
    gara({ eventId: 7, probHome: 60, probOver25: 70, probBtts: 56 }),
  ], MEDIE, 6);

  assert.equal(righe.length, 1, "la stessa gara e' entrata piu' volte");
  // Casa +15,5 · Over 2,5 +19,1 · Gol/Gol +2,6: vince Over 2,5.
  assert.equal(righe[0].mercato, "Over 2,5");
  assert.ok(Math.abs(righe[0].scarto - 19.1) < 1e-9, `scarto ${righe[0].scarto}`);
});

test("sotto la media non e' una lettura, e le gare non giocabili restano fuori", () => {
  const righe = sbilanciDelGiorno([
    gara({ eventId: 1, probHome: 30, probDraw: 20, probAway: 25, probOver25: 40, probBtts: 50 }),
    gara({ eventId: 2, probAway: 80, status: "postponed" }),
    gara({ eventId: 3, probAway: 80, status: "finished" }),
    gara({ eventId: 4, probAway: 80, status: "cancelled" }),
  ], MEDIE, 6);

  assert.deepEqual(righe, [], `sono entrate ${righe.length} righe che non dovevano esserci`);
});

test("si mostrano al piu' quante ne servono, dalla piu' staccata in giu'", () => {
  const molte = Array.from({ length: 20 }, (_, i) => gara({ eventId: i + 1, probAway: 30 + i }));
  const righe = sbilanciDelGiorno(molte, MEDIE, 6);

  assert.equal(righe.length, 6);
  for (let i = 1; i < righe.length; i += 1) {
    assert.ok(righe[i].scarto <= righe[i - 1].scarto, "ordine rotto");
  }
  assert.equal(righe[0].eventId, 20, "in cima non c'e' la piu' staccata");
});
