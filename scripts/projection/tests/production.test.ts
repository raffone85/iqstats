/**
 * Test della proiezione di produzione: fascia, miscela, ripiego.
 *
 * La domanda qui non e' se il modello calcola bene — quella la risponde il test di parita'
 * — ma se attorno al modello si comporta bene il resto: la fascia di maturita' cambia il
 * peso e l'intervallo, il ripiego entra quando i dati non bastano, e in nessun caso esce
 * un numero che finge una precisione che non ha.
 *
 * Le prove usano gli artefatti veri quando serve un caso reale, e artefatti costruiti a
 * mano quando serve un confine che gli artefatti veri non contengono.
 *
 * Esecuzione: npm run test:production
 */

import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { ArtefattoNonValido, caricaArtefattoDaFile, leggiArtefatto } from '../artifact-schema';
import type { ArtefattoModello } from '../artifact-schema';
import { prevedi } from '../predictor';
import { fasciaDi, proietta } from '../production';

const CARTELLA_ARTEFATTI = resolve(__dirname, '..', '..', 'models', 'output', 'artefatti');

function artefattiConMaturita(): readonly ArtefattoModello[] {
  return readdirSync(CARTELLA_ARTEFATTI)
    .filter((nome) => nome.endsWith('.json') && !nome.includes('-riscontro'))
    .filter((nome) => nome !== 'parita-esito.json')
    .map((nome) => {
      try {
        return caricaArtefattoDaFile(resolve(CARTELLA_ARTEFATTI, nome));
      } catch {
        return null;
      }
    })
    .filter((artefatto): artefatto is ArtefattoModello => artefatto !== null)
    .filter((artefatto) => artefatto.maturita !== null);
}

/** Valori che soddisfano tutte le feature del modello, per isolare cio' che si prova. */
function valoriCompleti(
  artefatto: ArtefattoModello,
  sovrascritture: Readonly<Record<string, number>>,
): Record<string, number> {
  const valori: Record<string, number> = {};
  artefatto.feature_schema.ordine.forEach((nome, indice) => {
    valori[nome] = artefatto.feature_schema.preprocessing.media[indice];
  });
  Object.keys(sovrascritture).forEach((nome) => {
    valori[nome] = sovrascritture[nome];
  });
  return valori;
}

test('ogni artefatto porta le tre fasce, e il peso non cresce con lo storico', () => {
  const artefatti = artefattiConMaturita();
  assert.ok(artefatti.length > 0, 'nessun artefatto con parametri di maturita');

  artefatti.forEach((artefatto) => {
    const maturita = artefatto.maturita;
    assert.ok(maturita !== null);
    const nomi = Object.keys(maturita.per_fascia);
    assert.deepEqual(nomi, ['EARLY', 'DEVELOPING', 'MATURE']);

    const pesi = nomi.map((nome) => maturita.per_fascia[nome].peso_della_miscela);
    pesi.forEach((peso) => {
      assert.ok(peso >= 0 && peso <= 1, artefatto.model_id + ': peso fuori da zero e uno');
    });
    // Con piu' storico il modello non puo' contare di meno: sarebbe un segno di errore.
    assert.ok(
      pesi[0] <= pesi[2],
      artefatto.model_id + ': in EARLY il modello pesa piu\' che in MATURE',
    );
  });
});

test('le fasce coprono ogni numero di gare dal minimo in su, senza sovrapporsi', () => {
  artefattiConMaturita().forEach((artefatto) => {
    const minimo = artefatto.training_metadata.min_previous_matches;
    for (let gare = minimo; gare <= 40; gare += 1) {
      const trovata = fasciaDi(artefatto, gare);
      assert.ok(trovata !== null, artefatto.model_id + ': nessuna fascia per ' + String(gare));
    }
  });
});

test('a storico maturo il valore atteso e quello del modello, senza miscela', () => {
  artefattiConMaturita().forEach((artefatto) => {
    const valori = valoriCompleti(artefatto, { gare_precedenti: 20 });
    const esito = proietta(artefatto, valori);
    assert.equal(esito.stato, 'prevista');
    if (esito.stato !== 'prevista') {
      return;
    }

    const grezza = prevedi(artefatto, valori);
    assert.equal(grezza.stato, 'prevista');
    if (grezza.stato !== 'prevista') {
      return;
    }

    assert.equal(esito.evidenze.fascia, 'MATURE');
    assert.equal(esito.pesoDelModello, 1);
    assert.equal(esito.origineDelValore, 'modello');
    assert.equal(esito.ripiegoUsato, false);
    assert.equal(esito.copertura, 'piena');
    assert.equal(esito.valoreAtteso, grezza.valoreAtteso);
  });
});

test('a storico scarso il valore atteso e la miscela dichiarata, cifra per cifra', () => {
  const conMiscela = artefattiConMaturita().filter((artefatto) => {
    const maturita = artefatto.maturita;
    return maturita !== null && maturita.per_fascia.EARLY.peso_della_miscela < 1;
  });
  assert.ok(conMiscela.length > 0, 'nessun artefatto mescola in fascia EARLY');

  conMiscela.forEach((artefatto) => {
    const maturita = artefatto.maturita;
    assert.ok(maturita !== null);
    const fascia = maturita.per_fascia.EARLY;

    const valori = valoriCompleti(artefatto, { gare_precedenti: 3 });
    const esito = proietta(artefatto, valori);
    const grezza = prevedi(artefatto, valori);
    assert.equal(esito.stato, 'prevista');
    assert.equal(grezza.stato, 'prevista');
    if (esito.stato !== 'prevista' || grezza.stato !== 'prevista') {
      return;
    }

    const peso = fascia.peso_della_miscela;
    const atteso = peso * grezza.valoreAtteso + (1 - peso) * valori[fascia.mescolato_con];
    assert.ok(
      Math.abs(esito.valoreAtteso - atteso) < 1e-12,
      artefatto.model_id + ': la miscela non torna',
    );
    assert.equal(esito.origineDelValore, 'miscela');
    assert.equal(esito.evidenze.fascia, 'EARLY');
    assert.equal(esito.copertura, 'piena');
    assert.equal(esito.ripiegoUsato, false);
  });
});

test('l\'intervallo di una fascia usa i parametri di quella fascia', () => {
  artefattiConMaturita().forEach((artefatto) => {
    const maturita = artefatto.maturita;
    assert.ok(maturita !== null);
    const early = maturita.per_fascia.EARLY;

    const esito = proietta(artefatto, valoriCompleti(artefatto, { gare_precedenti: 3 }));
    assert.equal(esito.stato, 'prevista');
    if (esito.stato !== 'prevista' || esito.intervallo === null) {
      return;
    }
    assert.equal(esito.intervallo.livelloNominale, early.livello_nominale);
    assert.equal(esito.intervallo.livelloDichiarato, artefatto.calibration.livello_dichiarato);
    assert.ok(esito.intervallo.basso <= esito.intervallo.alto);
  });
});

test('sotto il minimo di gare si ripiega, e il ripiego non dichiara un intervallo', () => {
  artefattiConMaturita().forEach((artefatto) => {
    const minimo = artefatto.training_metadata.min_previous_matches;
    const valori = valoriCompleti(artefatto, { gare_precedenti: minimo - 1 });
    const esito = proietta(artefatto, valori);
    assert.equal(esito.stato, 'prevista');
    if (esito.stato !== 'prevista') {
      return;
    }
    assert.equal(esito.ripiegoUsato, true);
    assert.equal(esito.origineDelValore, 'ripiego');
    assert.equal(esito.copertura, 'ridotta');
    assert.equal(esito.pesoDelModello, 0);
    assert.equal(esito.intervallo, null, 'il ripiego non ha un intervallo calibrato');
  });
});

test('il ripiego prende il gradino con l\'errore minore fra quelli disponibili', () => {
  artefattiConMaturita().forEach((artefatto) => {
    const maturita = artefatto.maturita;
    assert.ok(maturita !== null);
    const gradini = maturita.per_fascia.EARLY.ripiego_ordinato;
    assert.ok(gradini !== null && gradini.length > 0);
    if (gradini === null) {
      return;
    }
    for (let indice = 1; indice < gradini.length; indice += 1) {
      assert.ok(
        gradini[indice - 1].mae_fuori_campione <= gradini[indice].mae_fuori_campione,
        artefatto.model_id + ': i gradini di ripiego non sono ordinati per errore',
      );
    }

    const valori = valoriCompleti(artefatto, { gare_precedenti: 2 });
    valori[gradini[0].colonna] = 7.5;
    const esito = proietta(artefatto, valori);
    assert.equal(esito.stato, 'prevista');
    if (esito.stato === 'prevista') {
      assert.equal(esito.valoreAtteso, 7.5);
    }
  });
});

test('se manca una feature si ripiega invece di prevedere a meta\'', () => {
  artefattiConMaturita().forEach((artefatto) => {
    const maturita = artefatto.maturita;
    assert.ok(maturita !== null);
    const gradini = maturita.per_fascia.MATURE.ripiego_ordinato;
    if (gradini === null || gradini.length === 0) {
      return;
    }

    const valori = valoriCompleti(artefatto, { gare_precedenti: 20 });
    // Una feature che non e' un gradino di ripiego, altrimenti si toglie anche quello.
    const daTogliere = artefatto.feature_schema.ordine.find(
      (nome) => !gradini.some((gradino) => gradino.colonna === nome)
        && nome !== 'gare_precedenti',
    );
    assert.ok(daTogliere !== undefined);
    if (daTogliere === undefined) {
      return;
    }
    delete valori[daTogliere];

    const esito = proietta(artefatto, valori);
    assert.equal(esito.stato, 'prevista');
    if (esito.stato === 'prevista') {
      assert.equal(esito.ripiegoUsato, true);
      assert.equal(esito.copertura, 'ridotta');
      assert.equal(esito.evidenze.feature, 'incomplete');
    }
  });
});

test('senza feature e senza ripiego non si produce nessun numero', () => {
  const artefatti = artefattiConMaturita();
  assert.ok(artefatti.length > 0);
  const artefatto = artefatti[0];
  const maturita = artefatto.maturita;
  assert.ok(maturita !== null);
  if (maturita === null) {
    return;
  }

  const valori = valoriCompleti(artefatto, { gare_precedenti: 20 });
  artefatto.feature_schema.ordine.forEach((nome) => {
    delete valori[nome];
  });
  valori.gare_precedenti = 20;

  const esito = proietta(artefatto, valori);
  assert.equal(esito.stato, 'non_prevista');
});

test('un peso di miscela fuori da zero e uno fa rifiutare l\'artefatto', () => {
  const artefatti = artefattiConMaturita();
  const grezzo = JSON.parse(JSON.stringify(artefatti[0])) as Record<string, unknown>;
  const maturita = grezzo.maturita as Record<string, Record<string, Record<string, unknown>>>;
  maturita.per_fascia.EARLY.peso_della_miscela = 1.4;

  assert.throws(() => leggiArtefatto(grezzo), ArtefattoNonValido);
});

test('una colonna di miscela che il modello non riceve fa rifiutare l\'artefatto', () => {
  const artefatti = artefattiConMaturita();
  const grezzo = JSON.parse(JSON.stringify(artefatti[0])) as Record<string, unknown>;
  const maturita = grezzo.maturita as Record<string, Record<string, Record<string, unknown>>>;
  maturita.per_fascia.EARLY.peso_della_miscela = 0.5;
  maturita.per_fascia.EARLY.mescolato_con = 'una_colonna_che_non_esiste';

  assert.throws(() => leggiArtefatto(grezzo), ArtefattoNonValido);
});

test('un artefatto senza parametri di maturita continua a produrre la proiezione', () => {
  const artefatti = artefattiConMaturita();
  const grezzo = JSON.parse(JSON.stringify(artefatti[0])) as Record<string, unknown>;
  grezzo.maturita = null;
  const artefatto = leggiArtefatto(grezzo);

  const esito = proietta(artefatto, valoriCompleti(artefatto, { gare_precedenti: 20 }));
  assert.equal(esito.stato, 'prevista');
  if (esito.stato === 'prevista') {
    assert.equal(esito.origineDelValore, 'modello');
    assert.equal(esito.pesoDelModello, 1);
    assert.equal(esito.evidenze.fascia, null);
  }
});
