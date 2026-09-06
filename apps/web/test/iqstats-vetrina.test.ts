// Prove della vetrina. Niente connessione: legge l'artefatto scritto dallo script offline.
//
// Quello che conta e' che **una vetrina non mostri gare gia' cominciate**: passata la loro
// ora non sono piu' letture in arrivo, e una sezione che le tiene diventa un archivio senza
// esito. Il tempo si passa da fuori, altrimenti la prova dipenderebbe dal giorno in cui gira.
import assert from "node:assert/strict";
import test from "node:test";

import { vetrinaDelleLetture } from "../src/server/iqstats/vetrina.ts";
import rapporto from "../src/server/iqstats/artefatti/vetrina-letture.json" with { type: "json" };

const primoCalcio = rapporto.letture
  .map((v) => new Date(v.kickoff).getTime())
  .sort((a, b) => a - b)[0] ?? Date.now();

test("prima di tutte le gare la vetrina le mostra tutte", () => {
  const vetrina = vetrinaDelleLetture(new Date(primoCalcio - 3_600_000));
  assert.notEqual(vetrina, null);
  assert.equal(vetrina?.letture.length, rapporto.letture.length);
});

test("dopo l'ultima gara la vetrina non esiste, invece di mostrarsi vuota", () => {
  const ultimo = rapporto.letture
    .map((v) => new Date(v.kickoff).getTime())
    .sort((a, b) => b - a)[0] ?? Date.now();
  assert.equal(vetrinaDelleLetture(new Date(ultimo + 3_600_000)), null);
});

test("le letture in vetrina stanno tutte dentro la fascia che regge", () => {
  const vetrina = vetrinaDelleLetture(new Date(primoCalcio - 3_600_000));
  for (const voce of vetrina?.letture ?? []) {
    // Sopra l'ottanta per cento il modello promette 81,5% e rende 74,7%: la vetrina non
    // pesca li'. Se l'artefatto portasse una lettura piu' alta, sarebbe stato scritto da
    // una regola diversa da quella che il dossier usa.
    assert.ok(voce.probabilita <= 0.8, `${voce.casa}-${voce.fuori}: ${voce.probabilita}`);
    assert.ok(voce.probabilita >= 0.5, `${voce.casa}-${voce.fuori}: ${voce.probabilita}`);
  }
});
