// Prove della lettura degli indisponibili.
//
// Pure: nessuna rete, nessun database. Sorvegliano che la pagina non parli la lingua
// della fonte e che non inventi un motivo dove la fonte non lo dice.
//
// Il vocabolario e' misurato su trenta gare dei prossimi tre giorni: 83 indisponibili
// con stato `injured` e 5 con `suspended`, motivi in inglese o in forma tecnica.
import assert from "node:assert/strict";
import test from "node:test";

import { motivoInItaliano } from "../src/server/iqstats/indisponibili.ts";

test("l'infortunio esce con la parte del corpo, in italiano", () => {
  assert.deepEqual(motivoInItaliano("injured", "Knee Injury"),
    { stato: "infortunato", motivo: "ginocchio" });
  assert.deepEqual(motivoInItaliano("injured", "Hamstring Injury"),
    { stato: "infortunato", motivo: "flessori" });
  assert.deepEqual(motivoInItaliano("injured", "Cruciate Ligament Injury"),
    { stato: "infortunato", motivo: "legamento crociato" });
});

test("la squalifica distingue l'espulsione dal cartellino", () => {
  assert.deepEqual(motivoInItaliano("suspended", "red_card_suspension"),
    { stato: "squalificato", motivo: "espulsione" });
  assert.deepEqual(motivoInItaliano("suspended", "yellow_or_red_card_suspension"),
    { stato: "squalificato", motivo: null });
});

test("un motivo che non conosciamo non arriva in pagina in inglese", () => {
  // Resta lo stato: meglio dire meno che ripetere l'etichetta della fonte.
  assert.deepEqual(motivoInItaliano("injured", "Unknown"),
    { stato: "infortunato", motivo: null });
  assert.deepEqual(motivoInItaliano("injured", "Quadratus Lumborum Strain"),
    { stato: "infortunato", motivo: null });
});

test("operazione e frattura si riconoscono prima della parte del corpo", () => {
  assert.deepEqual(motivoInItaliano("injured", "Knee Surgery"),
    { stato: "infortunato", motivo: "operato" });
  assert.deepEqual(motivoInItaliano("injured", "Broken Foot"),
    { stato: "infortunato", motivo: "frattura" });
});

test("uno stato che la fonte non dichiara non diventa un infortunio", () => {
  assert.deepEqual(motivoInItaliano(null, null), { stato: "altro", motivo: null });
  assert.deepEqual(motivoInItaliano("unknown", "pending_transfer"),
    { stato: "altro", motivo: "in uscita" });
});
