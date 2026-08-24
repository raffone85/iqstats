// I ritardi: da quante gare non succede una cosa, e quante volte succede davvero.
import assert from "node:assert/strict";
import test from "node:test";

import { ritardiDi } from "../src/server/iqstats/projection/ritardi.ts";
import type { OsservazioneSquadraGara } from "../src/server/iqstats/projection/snapshot.ts";

/** Una gara: `fatte` e `subite` bastano a decidere tutti e quattro gli eventi. */
function gara(giorno: number, fatte: number | null, subite: number | null, lato = "home") {
  return {
    lato,
    quando: `2026-01-${String(giorno).padStart(2, "0")}T18:00:00.000Z`,
    stagione: 1,
    retiFatte: fatte,
    retiSubite: subite,
  } as unknown as OsservazioneSquadraGara;
}

/** Otto gare, dalla piu' vecchia alla piu' recente, tutte 1-1. */
function ottoPari() {
  return Array.from({ length: 8 }, (_, i) => gara(i + 1, 1, 1));
}

test("il ritardo si conta dalla gara piu' recente, non dalla piu' vecchia", () => {
  // Porta inviolata nella terzultima (giorno 6), poi due gare con gol subiti.
  const righe = ottoPari();
  righe[5] = gara(6, 2, 0);
  const r = ritardiDi(righe, "home").find((x) => x.evento === "Chiude senza subire gol");
  assert.ok(r !== undefined, "l'evento non e' entrato");
  assert.equal(r.gare, 2, `ha contato dall'altro capo: ${r.gare}`);
});

test("zero vuol dire che e' successo nell'ultima gara", () => {
  const righe = ottoPari();
  righe[7] = gara(8, 3, 0);
  const r = ritardiDi(righe, "home").find((x) => x.evento === "Chiude senza subire gol");
  assert.ok(r !== undefined);
  assert.equal(r.gare, 0);
  assert.equal(r.campione, 8);
  assert.ok(Math.abs(r.quota - 12.5) < 1e-9, `quota ${r.quota}`);
});

test("un evento mai visto non e' un ritardo", () => {
  // Otto gare 1-1: la porta inviolata non succede mai. Dire «non succede da 8» suggerirebbe
  // che sia in arrivo, e non lo e': non l'abbiamo mai vista.
  const eventi = ritardiDi(ottoPari(), "home").map((r) => r.evento);
  assert.ok(!eventi.includes("Chiude senza subire gol"), `e' entrato: ${eventi.join(", ")}`);
  // Gli altri tre invece succedono sempre, quindi ci sono con ritardo zero.
  assert.ok(eventi.includes("Va a segno"));
  assert.ok(eventi.includes("Segnano entrambe"));
});

test("sotto il campione minimo non si dichiara nessuna quota", () => {
  const righe = Array.from({ length: 5 }, (_, i) => gara(i + 1, 1, 1));
  assert.deepEqual(ritardiDi(righe, "home"), []);
});

test("l'altro lato del campo non entra nel conto", () => {
  // Otto in casa tutte con gol subiti, e otto in trasferta tutte a porta inviolata.
  const righe = [
    ...ottoPari(),
    ...Array.from({ length: 8 }, (_, i) => gara(i + 10, 2, 0, "away")),
  ];
  const casa = ritardiDi(righe, "home").map((r) => r.evento);
  assert.ok(!casa.includes("Chiude senza subire gol"), "le gare in trasferta sono entrate");
  const trasferta = ritardiDi(righe, "away").find((r) => r.evento === "Chiude senza subire gol");
  assert.ok(trasferta !== undefined);
  assert.equal(trasferta.gare, 0);
  assert.equal(trasferta.quota, 100);
});

test("una gara senza reti registrate non azzera ne' allunga il ritardo", () => {
  // Porta inviolata al giorno 6, poi una gara ignota, poi una con gol subiti.
  const righe = ottoPari();
  righe[5] = gara(6, 2, 0);
  righe[6] = gara(7, null, null);
  const r = ritardiDi(righe, "home").find((x) => x.evento === "Chiude senza subire gol");
  assert.ok(r !== undefined);
  // Le gare note dopo quella inviolata sono una sola: la riga ignota non conta.
  assert.equal(r.gare, 1, `la riga senza reti e' stata contata: ${r.gare}`);
  assert.equal(r.campione, 7, `campione ${r.campione}`);
});
