// La prossima giornata di ogni competizione: quale turno e', e che cosa resta fuori.
//
// Funzione pura: le gare si costruiscono a mano, ed e' il punto. Il caso che conta e'
// quello vero, misurato sulla fonte il 24 agosto: la Premier aveva una gara di turno 1 e
// dieci di turno 2, la Serie A una di turno 1 e dieci di turno 2, la Liga quattro di
// turno 1, una di turno 2 e dieci di turno 3. Prendendo il turno piu' basso il menu
// mostrava «giornata 1, una gara» e nascondeva la giornata vera.
import assert from "node:assert/strict";
import test from "node:test";

import { prossimeGiornate } from "../src/server/iqstats/giornate.ts";
import type { MatchListItem } from "../src/server/iqstats/matches.ts";

let progressivo = 0;

function gara(
  leagueId: number,
  turno: number | null,
  giorno: number,
  status = "notstarted",
): MatchListItem {
  progressivo += 1;
  return {
    eventId: progressivo,
    leagueId,
    leagueName: `Lega ${leagueId}`,
    leagueCountry: null,
    leagueCountryCode: null,
    homeTeam: "Casa",
    awayTeam: "Ospite",
    homeTeamId: 1,
    awayTeamId: 2,
    kickoff: `2026-08-${String(giorno).padStart(2, "0")}T18:00:00.000Z`,
    status,
    homeScore: null,
    awayScore: null,
    roundName: null,
    roundNumber: turno,
    refereeId: null,
  };
}

function molte(leagueId: number, turno: number, quante: number, giorno: number) {
  return Array.from({ length: quante }, () => gara(leagueId, turno, giorno));
}

test("la giornata e' il turno con piu' gare, non il piu' basso", () => {
  // Il caso Premier League del 24 agosto: un recupero di turno 1, dieci gare di turno 2.
  const righe = [gara(1, 1, 24), ...molte(1, 2, 10, 29)];
  const [giornata] = prossimeGiornate(righe);

  assert.equal(giornata.giornata, 2, "ha preso il recupero e chiamato quello «prossima giornata»");
  assert.equal(giornata.gare.length, 10);
});

test("i recuperi si contano, non si nascondono", () => {
  // Il caso La Liga: quattro di turno 1, una di turno 2, dieci di turno 3.
  const righe = [...molte(3, 1, 4, 24), gara(3, 2, 25), ...molte(3, 3, 10, 30)];
  const [giornata] = prossimeGiornate(righe);

  assert.equal(giornata.giornata, 3);
  assert.equal(giornata.gare.length, 10);
  assert.equal(giornata.recuperi, 5, `recuperi ${giornata.recuperi}, dovevano essere 5`);
});

test("a parita' di gare vince il turno piu' basso, che si gioca prima", () => {
  const righe = [...molte(4, 7, 3, 26), ...molte(4, 8, 3, 30)];
  const [giornata] = prossimeGiornate(righe);
  assert.equal(giornata.giornata, 7);
});

test("una coppa non prende un numero di giornata", () => {
  // La Champions dichiara turni come 636: non e' una giornata, e scriverlo sarebbe falso.
  const righe = molte(7, 636, 8, 27);
  const [giornata] = prossimeGiornate(righe);

  assert.equal(giornata.giornata, null, "ha scritto un numero di giornata che non e' una giornata");
  assert.equal(giornata.gare.length, 8, "con turni da coppa devono restare tutte le gare");
  assert.equal(giornata.recuperi, 0);
});

test("le gare concluse, rinviate e annullate non entrano", () => {
  const righe = [
    ...molte(5, 1, 3, 24),
    gara(5, 1, 24, "finished"),
    gara(5, 1, 24, "postponed"),
    gara(5, 1, 24, "cancelled"),
  ];
  const [giornata] = prossimeGiornate(righe);
  assert.equal(giornata.gare.length, 3, `sono entrate ${giornata.gare.length} gare`);
});

test("le competizioni escono in ordine di primo calcio d'inizio", () => {
  const righe = [...molte(9, 1, 2, 30), ...molte(6, 1, 2, 25), ...molte(2, 1, 2, 27)];
  const ordine = prossimeGiornate(righe).map((g) => g.leagueId);
  assert.deepEqual(ordine, [6, 2, 9], `ordine ${ordine.join(", ")}`);
});
