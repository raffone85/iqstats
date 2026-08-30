import assert from "node:assert/strict";
import test from "node:test";

import { metroDi, type Bersaglio, type Ruolo } from "../src/server/iqstats/giocatori-metro.ts";

/**
 * La scelta del metro: con chi si confronta un giocatore.
 *
 * E' la decisione che il 30 agosto 2026 ha corretto un difetto vero: confrontando un
 * difensore con la media del campionato risultava esposto solo perche' difensore, e la
 * lettura finiva per proporre difensori. Queste prove sanno diventare rosse in entrambi i
 * versi: se il ruolo smettesse di essere usato dove c'e', e se venisse usato dove il
 * campione non lo regge.
 */

const fattore = (frequenza: number) => ({
  tagli: [1, 2, 3, 4],
  gruppi: [1, 2, 3, 4, 5].map((gruppo) => ({ gruppo, frequenza, casi: 1000 })),
});

const giallo: Bersaglio = {
  base: 0.134,
  fattori: { falli_per90: fattore(0.2), contrasti_per90: fattore(0.2) },
  ruoli: {
    D: { base: 0.165, casi: 40000 },
    F: { base: 0.106, casi: 30000 },
    // Un ruolo con la base ma senza le tabelle dei fattori: il campione reggeva la
    // frequenza e non la divisione in cinque gruppi.
    M: { base: 0.143, casi: 50000 },
  },
  per_ruolo: {
    D: { falli_per90: fattore(0.24), contrasti_per90: fattore(0.19) },
    F: { falli_per90: fattore(0.15), contrasti_per90: fattore(0.12) },
  },
};

test("con il ruolo si usa la base del ruolo, non quella del campionato", () => {
  const d = metroDi(giallo, "D");
  assert.equal(d.conRuolo, true);
  assert.equal(d.base, 0.165);
  assert.equal(d.metro.fra, "fra i difensori");
  assert.equal(d.metro.dei, "dei difensori");
  assert.equal(d.fattori.falli_per90?.gruppi[0].frequenza, 0.24);

  const f = metroDi(giallo, "F");
  assert.equal(f.base, 0.106);
  // L'articolo giusto e' parte della misura: «fra i attaccanti» sarebbe un errore
  // di lingua stampato accanto al nome di una persona.
  assert.equal(f.metro.fra, "fra gli attaccanti");
  assert.equal(f.metro.dei, "degli attaccanti");
  // La prova che il difetto e' corretto: due ruoli diversi non condividono piu' il metro.
  assert.notEqual(d.base, f.base);
});

test("senza ruolo si ripiega sul campionato, e lo si dice", () => {
  const senza = metroDi(giallo, null);
  assert.equal(senza.conRuolo, false);
  assert.equal(senza.base, 0.134);
  assert.equal(senza.metro.fra, "fra tutti i giocatori");
  assert.equal(senza.fattori.falli_per90?.gruppi[0].frequenza, 0.2);
});

test("un ruolo con la base ma senza tabelle ripiega anche lui, invece di mescolare", () => {
  // Prendere la base del ruolo e i gruppi del campionato darebbe un numero che non
  // appartiene a nessuna delle due misure.
  const m = metroDi(giallo, "M");
  assert.equal(m.conRuolo, false);
  assert.equal(m.base, 0.134);
  assert.equal(m.metro.fra, "fra tutti i giocatori");
});

test("un campionato senza alcuna tabella per ruolo non si rompe", () => {
  const soloLega: Bersaglio = { base: 0.1, fattori: { falli_per90: fattore(0.3) } };
  for (const ruolo of ["G", "D", "M", "F"] as Ruolo[]) {
    const esito = metroDi(soloLega, ruolo);
    assert.equal(esito.conRuolo, false);
    assert.equal(esito.base, 0.1);
  }
});
