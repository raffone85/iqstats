// Prove del confronto gara per gara: pure, senza livello dati.
//
// Quello che verificano e' la regola che tiene onesto un conto di percentuali: **due quote
// dentro il loro errore non sono due quote diverse**, e con venti gare per lato dieci punti
// non bastano. Senza questo, la sezione direbbe che 0,51 e' diverso da 0,49.
import assert from "node:assert/strict";
import test from "node:test";

import { contese } from "../src/server/iqstats/lati.ts";
import type { Duelli, Duello } from "../src/server/iqstats/lati.ts";

/** Un duello con la quota voluta su `gare` partite: i pareggi restano zero. */
function duello(chiave: string, piu: number, gare: number): Duello {
  const quota = piu / gare;
  return {
    chiave,
    nome: chiave,
    piu,
    pari: 0,
    meno: gare - piu,
    gare,
    quota,
    errore: Math.sqrt((quota * (1 - quota)) / gare),
  };
}

function duelli(lato: "home" | "away", voci: readonly Duello[]): Duelli {
  return { lato, voci };
}

test("due quote dentro l'errore non fanno una contesa", () => {
  // 11 su 20 contro 9 su 20: dieci punti di distanza, errore composto circa 0,157.
  const trovate = contese(
    duelli("home", [duello("corner", 11, 20)]),
    duelli("away", [duello("corner", 9, 20)]),
  );
  assert.deepEqual(trovate, []);
});

test("una distanza che supera l'errore passa, e porta i due conti per esteso", () => {
  // 18 su 20 contro 4 su 20: settanta punti, ben oltre l'errore.
  const trovate = contese(
    duelli("home", [duello("corner", 18, 20)]),
    duelli("away", [duello("corner", 4, 20)]),
  );
  assert.equal(trovate.length, 1);
  assert.equal(trovate[0].chiave, "corner");
  assert.equal(trovate[0].casa.piu, 18);
  assert.equal(trovate[0].fuori.piu, 4);
  assert.equal(trovate[0].casa.gare, 20);
  assert.ok(trovate[0].forza > 3, `forza ${trovate[0].forza}`);
});

test("si ordina sulla forza, non sulla distanza fra le quote", () => {
  // Tiri: 60 punti di distanza su 6 gare per lato, quindi errore grande.
  // Corner: 40 punti su 40 gare per lato, errore piccolo. Vince il corner.
  const trovate = contese(
    duelli("home", [duello("tiri", 5, 6), duello("corner", 28, 40)]),
    duelli("away", [duello("tiri", 1, 6), duello("corner", 12, 40)]),
  );
  assert.equal(trovate[0].chiave, "corner");
});

test("una famiglia che manca a un lato non entra, e non diventa zero", () => {
  const trovate = contese(
    duelli("home", [duello("parate", 18, 20)]),
    duelli("away", [duello("corner", 2, 20)]),
  );
  assert.deepEqual(trovate, []);
});

test("senza uno dei due lati non c'e' confronto", () => {
  assert.deepEqual(contese(null, duelli("away", [duello("corner", 4, 20)])), []);
  assert.deepEqual(contese(duelli("home", [duello("corner", 18, 20)]), null), []);
});

test("si mostrano al massimo le prime", () => {
  const casa = ["tiri", "corner", "falli", "gialli"].map((k) => duello(k, 19, 20));
  const fuori = ["tiri", "corner", "falli", "gialli"].map((k) => duello(k, 2, 20));
  assert.equal(contese(duelli("home", casa), duelli("away", fuori)).length, 3);
  assert.equal(contese(duelli("home", casa), duelli("away", fuori), 1).length, 1);
});
