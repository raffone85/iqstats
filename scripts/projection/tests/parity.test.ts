/**
 * Test di parita' fra Python e TypeScript.
 *
 * La domanda e' una sola: partendo dallo stesso artefatto e dalle stesse feature, i due
 * linguaggi producono lo stesso numero? Se la risposta e' no, il modello non entra in
 * produzione, per quanto sia bravo.
 *
 * Le tolleranze non sono scelte qui: arrivano dalla tavola di riscontro, che le eredita
 * dal piano di validazione. Differenza relativa entro 1e-9 sul predittore lineare,
 * differenza assoluta entro 1e-6 sul valore atteso e sugli estremi dell'intervallo.
 *
 * Oltre alla parita' si verificano i confini del contratto: valori mancanti, valori non
 * finiti, taglio a zero, feature costante, artefatto incoerente, checksum sbagliato.
 *
 * Esecuzione: npm run test:projection (compila con tsc e lancia node --test).
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import {
  ArtefattoNonValido,
  caricaArtefattoDaFile,
  leggiArtefatto,
  verificaChecksum,
} from '../artifact-schema';
import type { ArtefattoModello } from '../artifact-schema';
import { preparaFeature } from '../feature-transform';
import { prevedi, prevediDaOrdine, quantilePoisson } from '../predictor';

const CARTELLA_ARTEFATTI = resolve(__dirname, '..', '..', 'models', 'output', 'artefatti');

interface RigaDiRiscontro {
  readonly event_id: string;
  readonly lato: string;
  readonly feature: readonly number[];
  readonly predittore_lineare: number;
  readonly valore_atteso: number;
  readonly intervallo_basso: number;
  readonly intervallo_alto: number;
}

interface Riscontro {
  readonly schema_version: string;
  readonly model_id: string;
  readonly artefatto: string;
  readonly checksum_artefatto: string;
  readonly ordine_feature: readonly string[];
  readonly tolleranze: {
    readonly predittore_lineare_relativa: number;
    readonly valore_atteso_assoluta: number;
    readonly estremi_intervallo_assoluta: number;
  };
  readonly righe: readonly RigaDiRiscontro[];
}

function riscontriDisponibili(): readonly string[] {
  return readdirSync(CARTELLA_ARTEFATTI)
    .filter((nome) => nome.endsWith('-riscontro.json'))
    .sort();
}

function leggiRiscontro(nome: string): Riscontro {
  return JSON.parse(readFileSync(join(CARTELLA_ARTEFATTI, nome), 'utf8')) as Riscontro;
}

function differenzaRelativa(ottenuto: number, atteso: number): number {
  const scala = Math.max(Math.abs(atteso), Number.MIN_VALUE);
  return Math.abs(ottenuto - atteso) / scala;
}

/** Esito misurato, raccolto qui e scritto alla fine: è la prova che il registro cita. */
interface EsitoParita {
  readonly model_id: string;
  readonly righe: number;
  readonly scarto_massimo_predittore_relativo: number;
  readonly scarto_massimo_valore_atteso: number;
  readonly scarto_massimo_intervallo: number;
  readonly tolleranze: Riscontro['tolleranze'];
  readonly superato: boolean;
}

const esiti: EsitoParita[] = [];

const riscontri = riscontriDisponibili();

test('esiste almeno un artefatto da mettere alla prova', () => {
  assert.ok(riscontri.length > 0, `nessuna tavola di riscontro in ${CARTELLA_ARTEFATTI}`);
});

for (const nomeRiscontro of riscontri) {
  const riscontro = leggiRiscontro(nomeRiscontro);
  const percorsoArtefatto = join(CARTELLA_ARTEFATTI, riscontro.artefatto);

  test(`${riscontro.model_id}: l'artefatto sul disco e' quello validato`, () => {
    const artefatto = caricaArtefattoDaFile(percorsoArtefatto);
    assert.equal(artefatto.model_id, riscontro.model_id);
    assert.deepEqual([...artefatto.feature_schema.ordine], [...riscontro.ordine_feature]);
  });

  test(`${riscontro.model_id}: parita' su ${riscontro.righe.length} righe`, () => {
    const artefatto = caricaArtefattoDaFile(percorsoArtefatto);
    const tolleranze = riscontro.tolleranze;

    let peggiorEta = 0;
    let peggiorAtteso = 0;
    let peggiorIntervallo = 0;

    for (const riga of riscontro.righe) {
      const esito = prevediDaOrdine(artefatto, riga.feature);
      assert.equal(esito.stato, 'prevista', `${riga.event_id}/${riga.lato}: previsione mancata`);
      if (esito.stato !== 'prevista') {
        continue;
      }

      const scartoEta = differenzaRelativa(esito.predittoreLineare, riga.predittore_lineare);
      const scartoAtteso = Math.abs(esito.valoreAtteso - riga.valore_atteso);
      const scartoBasso = Math.abs(esito.intervallo.basso - riga.intervallo_basso);
      const scartoAlto = Math.abs(esito.intervallo.alto - riga.intervallo_alto);

      peggiorEta = Math.max(peggiorEta, scartoEta);
      peggiorAtteso = Math.max(peggiorAtteso, scartoAtteso);
      peggiorIntervallo = Math.max(peggiorIntervallo, scartoBasso, scartoAlto);

      assert.ok(
        scartoEta <= tolleranze.predittore_lineare_relativa,
        `${riga.event_id}/${riga.lato}: predittore lineare, scarto relativo ${scartoEta}`,
      );
      assert.ok(
        scartoAtteso <= tolleranze.valore_atteso_assoluta,
        `${riga.event_id}/${riga.lato}: valore atteso, scarto ${scartoAtteso}`,
      );
      assert.ok(
        Math.max(scartoBasso, scartoAlto) <= tolleranze.estremi_intervallo_assoluta,
        `${riga.event_id}/${riga.lato}: intervallo, scarto ${Math.max(scartoBasso, scartoAlto)}`,
      );
    }

    esiti.push({
      model_id: riscontro.model_id,
      righe: riscontro.righe.length,
      scarto_massimo_predittore_relativo: peggiorEta,
      scarto_massimo_valore_atteso: peggiorAtteso,
      scarto_massimo_intervallo: peggiorIntervallo,
      tolleranze,
      superato: peggiorEta <= tolleranze.predittore_lineare_relativa
        && peggiorAtteso <= tolleranze.valore_atteso_assoluta
        && peggiorIntervallo <= tolleranze.estremi_intervallo_assoluta,
    });

    console.log(
      `  ${riscontro.model_id}: scarto massimo — predittore ${peggiorEta.toExponential(3)}`
      + `, atteso ${peggiorAtteso.toExponential(3)}`
      + `, intervallo ${peggiorIntervallo.toExponential(3)}`,
    );
  });

  test(`${riscontro.model_id}: la via per nome e quella per ordine coincidono`, () => {
    const artefatto = caricaArtefattoDaFile(percorsoArtefatto);
    const riga = riscontro.righe[0];
    const perNome: Record<string, number> = {};
    artefatto.feature_schema.ordine.forEach((nome, indice) => {
      perNome[nome] = riga.feature[indice];
    });

    const daOrdine = prevediDaOrdine(artefatto, riga.feature);
    const daNomi = prevedi(artefatto, perNome);
    assert.deepEqual(daNomi, daOrdine);
  });
}

function artefattoDiProva(): ArtefattoModello {
  const percorso = join(CARTELLA_ARTEFATTI, riscontri[0].replace('-riscontro.json', '.json'));
  return caricaArtefattoDaFile(percorso);
}

test('una feature mancante non produce una previsione', () => {
  const artefatto = artefattoDiProva();
  const valori = artefatto.feature_schema.ordine.map(() => 0 as number | null);
  valori[3] = null;

  const esito = prevediDaOrdine(artefatto, valori);
  assert.equal(esito.stato, 'non_prevista');
  if (esito.stato === 'non_prevista') {
    assert.equal(esito.motivo, 'feature_mancanti');
    assert.deepEqual([...esito.featureMancanti], [artefatto.feature_schema.ordine[3]]);
  }
});

test('una feature non finita non produce una previsione', () => {
  const artefatto = artefattoDiProva();
  const valori = artefatto.feature_schema.ordine.map(() => 0);
  valori[1] = Number.POSITIVE_INFINITY;

  const esito = prevediDaOrdine(artefatto, valori);
  assert.equal(esito.stato, 'non_prevista');
  if (esito.stato === 'non_prevista') {
    assert.equal(esito.motivo, 'feature_non_finite');
    assert.deepEqual([...esito.featureNonFinite], [artefatto.feature_schema.ordine[1]]);
  }
});

test('un elenco piu' + ' corto dell\'ordine dichiarato non produce una previsione', () => {
  const artefatto = artefattoDiProva();
  const esito = prevediDaOrdine(artefatto, [0, 0, 0]);
  assert.equal(esito.stato, 'non_prevista');
});

test('una feature costante si standardizza senza dividere per zero', () => {
  const schema = {
    ordine: ['costante', 'variabile'],
    preprocessing: { tipo: 'standardizzazione' as const, media: [5, 10], scala: [0, 2] },
    valori_mancanti: '',
    valori_non_finiti: '',
  };
  const esito = preparaFeature(schema, [5, 14]);
  assert.equal(esito.stato, 'pronte');
  if (esito.stato === 'pronte') {
    assert.deepEqual([...esito.standardizzate], [0, 2]);
  }
});

test('il taglio a zero si applica al valore atteso del modello lineare', () => {
  const artefatto: ArtefattoModello = leggiArtefatto({
    schema_version: 'artefatto-modello/1',
    model_id: 'prova__ridge',
    model_version: '1.0.0',
    target: 'prova',
    model_type: 'ridge',
    stato: 'experimental',
    feature_schema: {
      ordine: ['x'],
      preprocessing: { tipo: 'standardizzazione', media: [0], scala: [1] },
      valori_mancanti: '',
      valori_non_finiti: '',
    },
    coefficients: [1],
    intercept: 0,
    collegamento: 'identita',
    taglio: { minimo: 0, massimo: null, applicato_a: 'valore atteso' },
    calibration: {
      dispersione: 1,
      soglia_poisson: 1.05,
      distribuzione_intervallo: 'poisson',
      livello_nominale: 0.8,
      livello_dichiarato: 0.8,
      copertura_sul_periodo_di_addestramento: null,
      nota: '',
    },
    training_metadata: {
      righe: 0, da: '', a: '', leghe: 0,
      min_previous_matches: 3, feature_candidate: 1, densita_minima_richiesta: 0.95,
    },
    validation_metrics: null,
    checksum: { algoritmo: 'sha256', ambito: 'prova', file: 'prova.sha256' },
  });

  const negativo = prevediDaOrdine(artefatto, [-4]);
  assert.equal(negativo.stato, 'prevista');
  if (negativo.stato === 'prevista') {
    assert.equal(negativo.predittoreLineare, -4);
    assert.equal(negativo.valoreAtteso, 0);
    assert.equal(negativo.intervallo.basso, 0);
  }

  const positivo = prevediDaOrdine(artefatto, [3]);
  assert.equal(positivo.stato, 'prevista');
  if (positivo.stato === 'prevista') {
    assert.equal(positivo.valoreAtteso, 3);
  }
});

test('un artefatto con lunghezze incoerenti viene rifiutato', () => {
  assert.throws(
    () => leggiArtefatto({
      schema_version: 'artefatto-modello/1',
      model_type: 'ridge',
      collegamento: 'identita',
      feature_schema: {
        ordine: ['a', 'b'],
        preprocessing: { tipo: 'standardizzazione', media: [0], scala: [1] },
      },
      coefficients: [1, 2],
      calibration: {
        dispersione: 1, distribuzione_intervallo: 'poisson', livello_nominale: 0.8,
      },
    }),
    ArtefattoNonValido,
  );
});

test('uno schema di artefatto sconosciuto viene rifiutato', () => {
  assert.throws(
    () => leggiArtefatto({ schema_version: 'artefatto-modello/99' }),
    ArtefattoNonValido,
  );
});

test('un checksum diverso viene rifiutato', () => {
  assert.throws(() => verificaChecksum('a'.repeat(64), 'b'.repeat(64)), ArtefattoNonValido);
  assert.doesNotThrow(() => verificaChecksum('AB'.repeat(32), ('ab'.repeat(32)) + '\n'));
});

test('il quantile di Poisson e' + ' il piu\' piccolo conteggio che raggiunge il livello', () => {
  // Con media uno la cumulata vale 0,3679 in zero e 0,7358 in uno.
  assert.equal(quantilePoisson(0.3, 1), 0);
  assert.equal(quantilePoisson(0.4, 1), 1);
  assert.equal(quantilePoisson(0.74, 1), 2);
  assert.equal(quantilePoisson(0, 5), 0);
});

test('l\'esito della parita' + ' viene scritto per il registro dei modelli', () => {
  assert.equal(esiti.length, riscontri.length);
  assert.ok(esiti.every((esito) => esito.superato));

  const rapporto = {
    schema_version: 'esito-parita/1',
    generato_da: 'scripts/projection/tests/parity.test.ts',
    artefatti: esiti.length,
    superati: esiti.filter((esito) => esito.superato).length,
    esiti,
  };
  writeFileSync(
    join(CARTELLA_ARTEFATTI, 'parita-esito.json'),
    `${JSON.stringify(rapporto, null, 2)}\n`,
    'utf8',
  );
});
