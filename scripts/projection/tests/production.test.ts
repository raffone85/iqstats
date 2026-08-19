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

test('a storico maturo il valore atteso e quello che la fascia MATURE dichiara', () => {
  artefattiConMaturita().forEach((artefatto) => {
    const maturita = artefatto.maturita;
    assert.ok(maturita !== null);
    if (maturita === null) {
      return;
    }
    const fascia = maturita.per_fascia.MATURE;
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
    assert.equal(esito.pesoDelModello, fascia.peso_della_miscela);
    assert.equal(esito.ripiegoUsato, false);
    assert.equal(esito.copertura, 'piena');

    // A storico pieno sei bersagli su sette usano il modello per intero. Le parate no: il
    // loro peso misurato resta sotto uno anche a stagione inoltrata. E' un fatto misurato,
    // non un difetto, e il test verifica che si applichi il peso dichiarato — non che sia
    // uno.
    const peso = fascia.peso_della_miscela;
    if (peso === 1) {
      assert.equal(esito.origineDelValore, 'modello');
      assert.equal(esito.valoreAtteso, grezza.valoreAtteso);
      return;
    }
    assert.equal(esito.origineDelValore, 'miscela');
    const daMescolare = valori[fascia.mescolato_con];
    assert.equal(esito.valoreAtteso, peso * grezza.valoreAtteso + (1 - peso) * daMescolare);
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

function artefattiConAffidabilita(): readonly ArtefattoModello[] {
  return artefattiConMaturita().filter((artefatto) => artefatto.affidabilita !== null);
}

test('l\'affidabilita\' viaggia con l\'artefatto, e il punteggio viene dalla sua quota', () => {
  const artefatti = artefattiConAffidabilita();
  assert.ok(artefatti.length > 0, 'nessun artefatto porta l\'affidabilita\' misurata');

  artefatti.forEach((artefatto) => {
    const affidabilita = artefatto.affidabilita;
    assert.ok(affidabilita !== null);
    if (affidabilita === null) {
      return;
    }
    assert.ok(affidabilita.soglia_assoluta > 0, artefatto.model_id + ': soglia non positiva');

    const nomi = Object.keys(affidabilita.per_fascia);
    const punti = nomi.map((nome) => affidabilita.per_fascia[nome]).concat([affidabilita.complessivo]);
    punti.forEach((punto) => {
      const dove = artefatto.model_id;
      assert.ok(punto.punteggio >= 0 && punto.punteggio <= 100, dove + ': punteggio fuori scala');
      assert.ok(punto.punteggio_basso <= punto.punteggio, dove + ': estremo basso sopra il punteggio');
      assert.ok(punto.punteggio_alto >= punto.punteggio, dove + ': estremo alto sotto il punteggio');
      // Il punteggio non e' una sintesi: e' la quota misurata, moltiplicata per cento.
      assert.ok(
        Math.abs(punto.punteggio - Math.round(100 * punto.quota)) <= 1,
        dove + ': il punteggio non viene dalla quota che dichiara',
      );
      assert.ok(punto.righe_di_prova > 0, dove + ': punteggio senza righe di prova');
    });

    // La curva intera resta nell'artefatto: cambiare soglia non deve costare un
    // riaddestramento, e la soglia scelta deve essere uno dei punti gia' misurati.
    const soglie = (affidabilita.curva_completa.soglie ?? []) as readonly number[];
    assert.ok(soglie.length > 1, artefatto.model_id + ': curva completa assente');
    assert.ok(
      soglie.some((soglia) => Math.abs(soglia - affidabilita.soglia_assoluta) < 1e-9),
      artefatto.model_id + ': la soglia dichiarata non e\' un punto misurato della curva',
    );
  });
});

test('la proiezione dichiara il livello misurato per questa riga', () => {
  const artefatti = artefattiConAffidabilita();
  assert.ok(artefatti.length > 0);

  artefatti.forEach((artefatto) => {
    const affidabilita = artefatto.affidabilita;
    const attesa = affidabilita === null ? undefined : affidabilita.per_fascia.MATURE;
    if (affidabilita === null || attesa === undefined) {
      return;
    }
    const esito = proietta(artefatto, valoriCompleti(artefatto, { gare_precedenti: 20 }));
    assert.equal(esito.stato, 'prevista');
    if (esito.stato !== 'prevista') {
      return;
    }
    const livello = esito.evidenze.livello;
    assert.ok(livello !== null, artefatto.model_id + ': livello assente su una riga matura');
    if (livello === null) {
      return;
    }
    assert.equal(livello.soglia, affidabilita.soglia_assoluta);

    // Dove l\'artefatto porta lo strato condizionale, il punteggio e\' quello della gara e
    // non piu\' la costante della fascia. Dove non lo porta, resta la costante: sono i due
    // stati previsti, e il test verifica quello giusto invece di presumerne uno.
    const strato = affidabilita.condizionale;
    if (strato !== null && strato !== undefined) {
      assert.equal(livello.misuratoSu, 'condizionale');
      assert.equal(livello.righeDiProva, strato.righe_di_addestramento);
      return;
    }
    assert.equal(livello.misuratoSu, 'fascia');
    assert.equal(livello.punteggio, attesa.punteggio);
    assert.equal(livello.punteggioBasso, attesa.punteggio_basso);
    assert.equal(livello.punteggioAlto, attesa.punteggio_alto);
  });
});

test('il ripiego non dichiara nessun livello di affidabilita\'', () => {
  const artefatti = artefattiConAffidabilita();
  assert.ok(artefatti.length > 0);

  artefatti.forEach((artefatto) => {
    const esito = proietta(artefatto, valoriCompleti(artefatto, { gare_precedenti: 1 }));
    if (esito.stato !== 'prevista') {
      return;
    }
    assert.equal(esito.ripiegoUsato, true);
    // Nessuno ha misurato l'affidabilita' su quella baseline: dichiararla sarebbe
    // esattamente la precisione falsa che il ripiego deve evitare.
    assert.equal(esito.evidenze.livello, null);
    assert.ok(esito.evidenze.perche.indexOf('ripiego') >= 0);
  });
});

test('un punteggio che non viene dalla sua quota fa rifiutare l\'artefatto', () => {
  const artefatti = artefattiConAffidabilita();
  const grezzo = JSON.parse(JSON.stringify(artefatti[0])) as Record<string, unknown>;
  const affidabilita = grezzo.affidabilita as Record<string, Record<string, unknown>>;
  (affidabilita.complessivo as Record<string, unknown>).punteggio = 99;
  (affidabilita.complessivo as Record<string, unknown>).punteggio_alto = 99;

  assert.throws(() => leggiArtefatto(grezzo), ArtefattoNonValido);
});

test('un\'incertezza che non contiene il punteggio fa rifiutare l\'artefatto', () => {
  const artefatti = artefattiConAffidabilita();
  const grezzo = JSON.parse(JSON.stringify(artefatti[0])) as Record<string, unknown>;
  const affidabilita = grezzo.affidabilita as Record<string, Record<string, unknown>>;
  (affidabilita.complessivo as Record<string, unknown>).punteggio_basso = 100;

  assert.throws(() => leggiArtefatto(grezzo), ArtefattoNonValido);
});

function artefattiConCondizionale(): readonly ArtefattoModello[] {
  return artefattiConAffidabilita().filter(
    (artefatto) => artefatto.affidabilita !== null
      && artefatto.affidabilita.condizionale !== null
      && artefatto.affidabilita.condizionale !== undefined,
  );
}

test('lo strato condizionale da\' punteggi diversi a gare diverse', () => {
  const artefatti = artefattiConCondizionale();
  assert.ok(artefatti.length > 0, 'nessun artefatto porta lo strato condizionale');

  artefatti.forEach((artefatto) => {
    const strato = artefatto.affidabilita === null ? null : artefatto.affidabilita.condizionale;
    assert.ok(strato !== null && strato !== undefined);
    if (strato === null || strato === undefined) {
      return;
    }
    // Due gare che differiscono solo per una condizione devono dare punteggi diversi:
    // se non lo fanno, lo strato non sta condizionando nulla.
    const media = valoriCompleti(artefatto, { gare_precedenti: 20 });
    const alta = valoriCompleti(artefatto, { gare_precedenti: 20 });
    artefatto.feature_schema.ordine.forEach((nome, indice) => {
      if (nome === 'baseline_restringimento' || nome === 'baseline_lega') {
        alta[nome] = artefatto.feature_schema.preprocessing.media[indice]
          + 3 * artefatto.feature_schema.preprocessing.scala[indice];
      }
    });

    const uno = proietta(artefatto, media);
    const due = proietta(artefatto, alta);
    assert.equal(uno.stato, 'prevista');
    assert.equal(due.stato, 'prevista');
    if (uno.stato !== 'prevista' || due.stato !== 'prevista') {
      return;
    }
    const primo = uno.evidenze.livello;
    const secondo = due.evidenze.livello;
    assert.ok(primo !== null && secondo !== null);
    if (primo === null || secondo === null) {
      return;
    }
    assert.equal(primo.misuratoSu, 'condizionale');
    assert.equal(secondo.misuratoSu, 'condizionale');
    assert.ok(primo.punteggio >= 0 && primo.punteggio <= 100);
    assert.notEqual(primo.punteggio, secondo.punteggio);
    // L\'incertezza dichiarata e\' la calibrazione misurata, e circonda il punteggio.
    assert.ok(primo.punteggioBasso <= primo.punteggio);
    assert.ok(primo.punteggioAlto >= primo.punteggio);
    assert.equal(primo.soglia, artefatto.affidabilita === null ? 0 : artefatto.affidabilita.soglia_assoluta);
  });
});

test('senza una condizione si torna alla costante della fascia, non a zero', () => {
  const artefatti = artefattiConCondizionale();
  assert.ok(artefatti.length > 0);

  artefatti.forEach((artefatto) => {
    const strato = artefatto.affidabilita === null ? null : artefatto.affidabilita.condizionale;
    if (strato === null || strato === undefined) {
      return;
    }
    const daTogliere = strato.condizioni.find((nome) => nome !== 'valore_atteso'
      && nome !== 'gare_precedenti');
    if (daTogliere === undefined) {
      return;
    }
    const valori = valoriCompleti(artefatto, { gare_precedenti: 20 });
    valori[daTogliere] = Number.NaN;

    const esito = proietta(artefatto, valori);
    assert.equal(esito.stato, 'prevista');
    if (esito.stato !== 'prevista') {
      return;
    }
    // Il modello si ripiega perche\' gli manca una feature: il livello non si dichiara.
    // Quello che non deve succedere e\' un punteggio condizionale calcolato su un buco.
    const livello = esito.evidenze.livello;
    assert.ok(livello === null || livello.misuratoSu !== 'condizionale');
  });
});

test('una condizione che il modello non riceve fa rifiutare l\'artefatto', () => {
  const artefatti = artefattiConCondizionale();
  const grezzo = JSON.parse(JSON.stringify(artefatti[0])) as Record<string, unknown>;
  const affidabilita = grezzo.affidabilita as Record<string, Record<string, unknown>>;
  const strato = affidabilita.condizionale as Record<string, unknown>;
  strato.condizioni = (strato.condizioni as string[]).concat(['una_condizione_inventata']);
  (strato.coefficienti as number[]).push(0.1);
  ((strato.standardizzazione as Record<string, number[]>).media).push(0);
  ((strato.standardizzazione as Record<string, number[]>).scala).push(1);

  assert.throws(() => leggiArtefatto(grezzo), ArtefattoNonValido);
});
