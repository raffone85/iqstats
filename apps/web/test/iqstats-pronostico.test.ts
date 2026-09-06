// Prove della resa che il pronostico del dossier dichiara. Niente connessione: legge lo
// stesso artefatto del consuntivo di /metodo.
//
// Quello che conta e' che **il numero accanto al pronostico sia quello della sua famiglia**,
// non il complessivo: un pronostico sui corner che citasse la resa media di tutti i bersagli
// direbbe un numero vero al posto sbagliato. E che una famiglia senza consuntivo torni
// `null`, perche' il dossier dichiari l'assenza invece di mostrare mezza riga.
import assert from "node:assert/strict";
import test from "node:test";

import { articoloDiPercentuale } from "../src/lib/italiano.ts";
import { GARE_DEL_CONSUNTIVO, resaDelBersaglio } from "../src/server/iqstats/consuntivo.ts";
import rapporto from "../src/server/iqstats/artefatti/consuntivo-letture.json" with { type: "json" };

test("ogni famiglia del consuntivo torna i suoi conti, non quelli complessivi", () => {
  assert.ok(rapporto.per_bersaglio.length > 0);
  for (const voce of rapporto.per_bersaglio) {
    const resa = resaDelBersaglio(voce.bersaglio);
    assert.notEqual(resa, null, voce.bersaglio);
    assert.equal(resa?.letture, voce.letture);
    assert.equal(resa?.frequenzaOsservata, voce.frequenza_osservata);
    assert.equal(resa?.probabilitaPromessa, voce.probabilita_promessa);
  }
});

test("una famiglia che il consuntivo non conta torna null", () => {
  assert.equal(resaDelBersaglio("bersaglio_che_non_esiste"), null);
});

test("le gare del consuntivo sono quelle con almeno una lettura, non quelle chieste", () => {
  assert.equal(GARE_DEL_CONSUNTIVO, rapporto.gare_con_almeno_una_lettura);
  assert.ok(GARE_DEL_CONSUNTIVO <= rapporto.gare_chieste);
});

test("l'articolo davanti alla percentuale segue come il numero si legge", () => {
  // «l'83%» perche' ottantatré comincia per vocale, «il 90%» perche' novanta no.
  assert.equal(articoloDiPercentuale(83), "l’");
  assert.equal(articoloDiPercentuale(8), "l’");
  assert.equal(articoloDiPercentuale(11), "l’");
  assert.equal(articoloDiPercentuale(18), "l’");
  assert.equal(articoloDiPercentuale(1), "l’");
  assert.equal(articoloDiPercentuale(90), "il ");
  assert.equal(articoloDiPercentuale(9), "il ");
  assert.equal(articoloDiPercentuale(19), "il ");
  assert.equal(articoloDiPercentuale(100), "il ");
});
