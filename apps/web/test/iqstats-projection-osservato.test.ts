/**
 * Il numero osservato accanto a quello previsto e' calcolato sulle righe giuste?
 *
 * `mediaOsservata` risponde alla domanda «quanto ne produce questa squadra da questo lato
 * del campo, in questa stagione». Tre filtri, e ognuno qui puo' diventare rosso:
 *
 * 1. **il lato**: le gare in trasferta non entrano nella media di casa;
 * 2. **la stagione**: due stagioni in una media non dicono di che cosa parlano;
 * 3. **l'assenza**: un valore mancante non diventa zero, esce dal campione — e senza
 *    nemmeno una gara utile la risposta e' `null`, non 0.
 *
 * Esecuzione: npm run test:projection-osservato
 */

import assert from "node:assert/strict";
import test from "node:test";

import { gareOsservate, mediaOsservata } from "../src/server/iqstats/projection-store.ts";
import type { OsservazioneSquadraGara } from "../src/server/iqstats/projection/snapshot.ts";

type Lato = OsservazioneSquadraGara["lato"];

function riga(
  matchId: number,
  lato: Lato,
  stagione: number | null,
  tiri: number | null,
): OsservazioneSquadraGara {
  return {
    matchId,
    stagione,
    teamId: 1,
    opponentId: 2,
    lato,
    quando: "2026-08-" + String(10 + matchId) + "T18:00:00.000Z",
    refereeId: null,
    allenatoreId: null,
    turno: null,
    derby: null,
    retiFatte: null,
    retiSubite: null,
    prodotte: { total_shots: tiri },
    concesse: { total_shots: null },
    tiri: null,
    tiriConcessi: null,
  };
}

test("la media di casa guarda solo le gare in casa della stagione", () => {
  const righe = [
    riga(1, "home", 100, 10),
    riga(2, "home", 100, 20),
    // In trasferta: fuori dalla media di casa, anche se e' la stessa stagione.
    riga(3, "away", 100, 99),
    // Stagione diversa: fuori, anche se e' in casa.
    riga(4, "home", 99, 99),
  ];

  const esito = mediaOsservata(righe, "total_shots", "home", 100);
  assert.deepEqual(esito, { media: 15, campione: 2 });
});

test("un valore assente esce dal campione e non diventa zero", () => {
  const righe = [riga(1, "home", 100, 12), riga(2, "home", 100, null)];

  const esito = mediaOsservata(righe, "total_shots", "home", 100);
  // Con lo zero al posto dell'assenza la media sarebbe 6 su 2 gare.
  assert.deepEqual(esito, { media: 12, campione: 1 });
});

test("senza gare utili si risponde null, mai zero", () => {
  const righe = [riga(1, "away", 100, 10), riga(2, "home", 77, 10)];

  assert.equal(mediaOsservata(righe, "total_shots", "home", 100), null);
  assert.equal(mediaOsservata([], "total_shots", "home", 100), null);
  // Un bersaglio che la riga non porta non e' zero: e' assente.
  assert.equal(mediaOsservata([riga(1, "home", 100, 10)], "corner_kicks", "home", 100), null);
});

test("l'elenco e la media dicono la stessa cosa", () => {
  const righe = [
    riga(1, "home", 100, 10),
    riga(2, "home", 100, 20),
    riga(3, "home", 100, null),
    riga(4, "away", 100, 99),
    riga(5, "home", 99, 99),
  ];

  const gare = gareOsservate(righe, "total_shots", "home", 100);
  const media = mediaOsservata(righe, "total_shots", "home", 100);

  // Le due funzioni ripetono lo stesso filtro invece di condividerlo, per non cambiare
  // l'ordine di somma della media: questa prova e' cio' che tiene ferma quella scelta.
  assert.equal(gare.length, media?.campione);
  const somma = gare.reduce((totale, gara) => totale + gara.valore, 0);
  assert.equal(somma / gare.length, media?.media);
});

test("l'elenco parte dalla gara piu' recente e porta il suo avversario", () => {
  const gare = gareOsservate(
    [riga(1, "home", 100, 10), riga(3, "home", 100, 30), riga(2, "home", 100, 20)],
    "total_shots",
    "home",
    100,
  );
  assert.deepEqual(gare.map((gara) => gara.valore), [30, 20, 10]);
  assert.equal(gare[0]?.avversarioId, 2);
  assert.equal(gare[0]?.matchId, 3);
});
