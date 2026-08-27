// **La sezione arbitro dichiara un metodo, quindi la sua condizione va difesa da un test.**
//
// La frase «è già dentro il numero» è vera solo dove il modello del bersaglio ha girato
// davvero. Due cose possono romperla in silenzio:
//
// 1. `BERSAGLI_CON_ARBITRO` si scollega dagli artefatti — un bersaglio rinominato, o
//    riaddestrato senza gli ingressi dell'arbitro: la lista si svuota e la pagina smette
//    per sempre di dire una cosa vera, senza che nessuno se ne accorga;
// 2. `previstaDalModello` smette di distinguere il ripiego dal modello, e allora la frase
//    torna a comparire proprio dove non deve.
import assert from "node:assert/strict";
import test from "node:test";

import { ARTEFATTI_DI_PRODUZIONE } from "../src/server/iqstats/projection-artefatti.ts";
import {
  BERSAGLI_CON_ARBITRO,
  bersagliConArbitroEntrato,
  previstaDalModello,
  type ProiezioneDiGara,
} from "../src/server/iqstats/projection/match.ts";
import type { EsitoDiProduzione } from "../src/server/iqstats/projection/production.ts";

/**
 * Quanti ingressi guardano l'arbitro. **Non** `startsWith("arbitro_")`: i quattro bersagli
 * fuori lista ne portano uno solo, ed e' `interazione_casa_severita_arbitro`, che il
 * prefisso non lo ha.
 */
function ingressiArbitro(target: string): number {
  const artefatto = ARTEFATTI_DI_PRODUZIONE.get(target);
  assert.ok(artefatto, `nessun artefatto di produzione per il bersaglio ${target}`);
  return artefatto.feature_schema.ordine.filter((nome) => nome.includes("arbitro")).length;
}

test("i bersagli dichiarati portano davvero il profilo dell'arbitro", () => {
  assert.ok(BERSAGLI_CON_ARBITRO.length > 0, "la lista dei bersagli con arbitro e' vuota");
  for (const target of BERSAGLI_CON_ARBITRO) {
    // Sedici misurati il 27 agosto 2026. Il minimo tiene anche a modelli riaddestrati, ma
    // un bersaglio che scendesse a un solo ingresso non e' piu' «col profilo dell'arbitro».
    assert.ok(
      ingressiArbitro(target) >= 10,
      `${target} porta ${ingressiArbitro(target)} ingressi arbitro: non basta a dire che l'arbitro e' dentro`,
    );
  }
});

test("gli altri bersagli non sono nella lista, e infatti ne portano uno solo", () => {
  for (const [target] of ARTEFATTI_DI_PRODUZIONE) {
    if (BERSAGLI_CON_ARBITRO.includes(target)) continue;
    assert.equal(
      ingressiArbitro(target), 1,
      `${target} non e' nella lista ma porta ${ingressiArbitro(target)} ingressi arbitro`,
    );
  }
});

function esito(campi: Partial<EsitoDiProduzione> = {}): EsitoDiProduzione {
  return {
    stato: "prevista", target: "fouls", modelId: "prova", modelVersion: "1",
    valoreAtteso: 12, intervallo: null, origineDelValore: "modello", pesoDelModello: 1,
    ripiegoUsato: false, copertura: "piena", campioneDiAddestramento: 100,
    evidenze: {
      livello: null, perche: "prova", fascia: null, garePrecedenti: 10,
      garePrecedentiAvversario: 10, maeFuoriCampione: null, erroreStandardDelMae: null,
      biasFuoriCampione: null, righeDiProva: null, righeDiAddestramentoNellaFascia: null,
      stabilitaMisurabile: false, feature: "complete",
      formazione: "non disponibile: le formazioni non sono raccolte",
    },
    ...campi,
  } as EsitoDiProduzione;
}

test("sotto un ripiego l'arbitro non e' entrato nel numero", () => {
  assert.equal(previstaDalModello(esito()), true, "il modello che gira deve contare");
  assert.equal(
    previstaDalModello(esito({ ripiegoUsato: true, origineDelValore: "ripiego" })), false,
    "un ripiego non guarda gli ingressi dell'arbitro: non puo' contare",
  );
  assert.equal(
    previstaDalModello({
      stato: "non_prevista", target: "fouls", modelId: "prova",
      motivo: "al modello mancano 3 feature", featureMancanti: ["arbitro_gare_viste"],
    }), false,
    "un bersaglio non previsto non puo' contare",
  );
  // La miscela con la baseline resta modello: il peso cambia, gli ingressi no.
  assert.equal(
    previstaDalModello(esito({ origineDelValore: "miscela", pesoDelModello: 0.6 })), true,
    "la miscela usa comunque il modello, quindi l'arbitro e' entrato",
  );
});

function bersaglio(target: string, casa: EsitoDiProduzione, trasferta: EsitoDiProduzione) {
  return {
    target, modelId: "prova", casa, trasferta,
    linee: { casa: null, trasferta: null }, totale: null,
    scartoDiCalibrazioneDelleLinee: null,
  } as ProiezioneDiGara;
}

test("entrano solo i bersagli con l'arbitro previsti dal modello su entrambi i lati", () => {
  const previsto = esito();
  const ripiegato = esito({ ripiegoUsato: true, origineDelValore: "ripiego" });

  assert.deepEqual(
    bersagliConArbitroEntrato([
      bersaglio("fouls", previsto, previsto),
      bersaglio("yellow_cards", previsto, ripiegato),
      bersaglio("corner_kicks", previsto, previsto),
      bersaglio("shots_on_target", ripiegato, ripiegato),
    ]),
    ["fouls"],
    "deve restare solo il bersaglio con arbitro previsto da entrambi i lati",
  );

  // Il caso che oggi si vede in produzione: tutto in ripiego, niente da dichiarare.
  assert.deepEqual(
    bersagliConArbitroEntrato([
      bersaglio("fouls", ripiegato, ripiegato),
      bersaglio("yellow_cards", ripiegato, ripiegato),
    ]),
    [],
    "con tutto in ripiego la sezione non puo' dire che l'arbitro e' dentro il numero",
  );

  assert.deepEqual(bersagliConArbitroEntrato([]), [], "senza bersagli non si dichiara nulla");
});
