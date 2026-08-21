/**
 * Il totale di gara e le cinque linee coincidono con quelli di Python?
 *
 * Stessa disciplina del test sul predittore: Python esporta i numeri che devono uscire da
 * un insieme di coppie reali, e qui si ritrovano partendo dallo stesso artefatto. Le due
 * implementazioni della cumulata — la ricorrenza in TypeScript e la funzione di libreria
 * in Python — sono il punto in cui divergerebbero senza dare errore.
 *
 * Si verificano anche i confini che il metodo impone: il centro del totale è la somma
 * esatta dei due lati e non un terzo numero, sotto un ripiego non si dichiara né
 * intervallo né linee, e le soglie sono a mezzo punto perché il pareggio con la soglia non
 * esiste.
 *
 * Esecuzione: npm run test:match
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { test } from 'node:test';

import { caricaArtefattoDaFile } from '../../../apps/web/src/server/iqstats/projection/artifact-schema';
import type { ArtefattoModello } from '../../../apps/web/src/server/iqstats/projection/artifact-schema';
import {
  lineeDiLato,
  proiezioneDiGara,
  soglieDi,
  totaleDiGara,
} from '../../../apps/web/src/server/iqstats/projection/match';
import type { Linea } from '../../../apps/web/src/server/iqstats/projection/match';
import type { ProiezioneDiProduzione } from '../../../apps/web/src/server/iqstats/projection/production';

const CARTELLA = resolve(
  // Quattro passi: la radice del compilato e' la radice del progetto, perche' i moduli
  // del motore vivono ora in apps/web e i test restano qui.
  __dirname, '..', '..', '..', '..', 'models', 'output', 'artefatti',
);
const CODA = '-riscontro-totale.json';
const TOLLERANZA = 1e-9;

interface LineaAttesa {
  soglia: number;
  probabilita_sopra: number;
  probabilita_sotto: number;
}

interface Prova {
  event_id: string;
  atteso_casa: number;
  atteso_trasferta: number;
  totale: {
    valore_atteso: number;
    intervallo_basso: number;
    intervallo_alto: number;
    linee: LineaAttesa[];
  };
  linee_casa: LineaAttesa[];
  linee_trasferta: LineaAttesa[];
}

interface Riscontro {
  model_id: string;
  target: string;
  artefatto: string;
  prove: Prova[];
}

function riscontri(): Riscontro[] {
  const trovati: Riscontro[] = [];
  for (const nome of readdirSync(CARTELLA)) {
    if (!nome.endsWith(CODA)) {
      continue;
    }
    trovati.push(JSON.parse(readFileSync(join(CARTELLA, nome), 'utf8')) as Riscontro);
  }
  return trovati;
}

/** Una proiezione di lato finta ma coerente: qui si verifica il totale, non il modello. */
function latoPrevisto(
  artefatto: ArtefattoModello,
  valoreAtteso: number,
): ProiezioneDiProduzione {
  return {
    stato: 'prevista',
    target: artefatto.target,
    modelId: artefatto.model_id,
    modelVersion: artefatto.model_version,
    valoreAtteso,
    intervallo: null,
    origineDelValore: 'modello',
    pesoDelModello: 1,
    ripiegoUsato: false,
    copertura: 'piena',
    campioneDiAddestramento: artefatto.training_metadata.righe,
    evidenze: {
      livello: null,
      perche: 'prova',
      fascia: null,
      garePrecedenti: null,
      garePrecedentiAvversario: null,
      maeFuoriCampione: null,
      erroreStandardDelMae: null,
      biasFuoriCampione: null,
      righeDiProva: null,
      righeDiAddestramentoNellaFascia: null,
      stabilitaMisurabile: false,
      feature: 'complete',
      formazione: 'non disponibile: le formazioni non sono raccolte',
    },
  };
}

function latoDaRipiego(
  artefatto: ArtefattoModello,
  valoreAtteso: number,
): ProiezioneDiProduzione {
  const previsto = latoPrevisto(artefatto, valoreAtteso);
  return { ...previsto, ripiegoUsato: true, origineDelValore: 'ripiego', copertura: 'ridotta' };
}

function vicini(ottenuto: number, atteso: number, dove: string): void {
  const scarto = Math.abs(ottenuto - atteso);
  const relativo = Math.abs(atteso) > 1 ? scarto / Math.abs(atteso) : scarto;
  assert.ok(
    relativo <= TOLLERANZA,
    dove + ': atteso ' + String(atteso) + ', ottenuto ' + String(ottenuto),
  );
}

function confrontaLinee(
  ottenute: readonly Linea[] | null,
  attese: LineaAttesa[],
  dove: string,
): void {
  assert.ok(ottenute !== null, dove + ': linee assenti');
  assert.equal(ottenute.length, attese.length, dove + ': numero di linee');
  for (let indice = 0; indice < attese.length; indice += 1) {
    vicini(ottenute[indice].soglia, attese[indice].soglia, dove + ' soglia');
    vicini(
      ottenute[indice].probabilitaSopra, attese[indice].probabilita_sopra,
      dove + ' probabilita sopra',
    );
    vicini(
      ottenute[indice].probabilitaSotto, attese[indice].probabilita_sotto,
      dove + ' probabilita sotto',
    );
  }
}

const casi = riscontri();

test('esistono i campioni di riscontro del totale', () => {
  assert.equal(casi.length, 7, 'attesi sette campioni, uno per bersaglio');
  for (const caso of casi) {
    assert.ok(caso.prove.length >= 20, caso.target + ': troppe poche coppie');
  }
});

let confrontate = 0;

for (const caso of casi) {
  test('totale e linee coincidono con Python su ' + caso.target, () => {
    const artefatto = caricaArtefattoDaFile(resolve(CARTELLA, caso.artefatto));
    for (const prova of caso.prove) {
      const casa = latoPrevisto(artefatto, prova.atteso_casa);
      const trasferta = latoPrevisto(artefatto, prova.atteso_trasferta);
      const dove = caso.target + ' ' + prova.event_id;

      const totale = totaleDiGara(artefatto, casa, trasferta);
      assert.ok(totale !== null, dove + ': totale assente');
      vicini(totale.valoreAtteso, prova.totale.valore_atteso, dove + ' valore atteso');
      assert.ok(totale.intervallo !== null, dove + ': intervallo assente');
      vicini(totale.intervallo.basso, prova.totale.intervallo_basso, dove + ' basso');
      vicini(totale.intervallo.alto, prova.totale.intervallo_alto, dove + ' alto');
      confrontaLinee(totale.linee, prova.totale.linee, dove + ' totale');

      confrontaLinee(lineeDiLato(artefatto, casa), prova.linee_casa, dove + ' casa');
      confrontaLinee(
        lineeDiLato(artefatto, trasferta), prova.linee_trasferta, dove + ' trasferta',
      );
      confrontate += 1;
    }
  });
}

test('il centro del totale e\' la somma esatta, non una stima', () => {
  const caso = casi[0];
  const artefatto = caricaArtefattoDaFile(resolve(CARTELLA, caso.artefatto));
  for (const prova of caso.prove.slice(0, 10)) {
    const gara = proiezioneDiGara(
      artefatto,
      latoPrevisto(artefatto, prova.atteso_casa),
      latoPrevisto(artefatto, prova.atteso_trasferta),
    );
    assert.ok(gara.totale !== null);
    const somma = prova.atteso_casa + prova.atteso_trasferta;
    assert.equal(
      gara.totale.valoreAtteso, somma,
      'il totale deve essere identico alla somma, non vicino: nessun terzo numero',
    );
  }
});

test('sotto un ripiego il totale dichiara il valore e non l\'incertezza', () => {
  const caso = casi[0];
  const artefatto = caricaArtefattoDaFile(resolve(CARTELLA, caso.artefatto));
  const prova = caso.prove[0];
  const gara = proiezioneDiGara(
    artefatto,
    latoDaRipiego(artefatto, prova.atteso_casa),
    latoPrevisto(artefatto, prova.atteso_trasferta),
  );
  assert.ok(gara.totale !== null, 'la somma resta esatta anche sotto un ripiego');
  assert.equal(gara.totale.valoreAtteso, prova.atteso_casa + prova.atteso_trasferta);
  assert.equal(gara.totale.intervallo, null, 'nessun intervallo sotto un ripiego');
  assert.equal(gara.totale.linee, null, 'nessuna linea sotto un ripiego');
  assert.equal(
    gara.totale.affidabilita, null,
    'l\'affidabilita\' del totale e\' stata misurata sul modello, non su una baseline',
  );
  assert.equal(gara.linee.casa, null, 'nessuna linea sul lato che ha ripiegato');
  assert.notEqual(gara.linee.trasferta, null, 'l\'altro lato conserva le sue linee');
});

/** Un lato previsto che dichiara la sua fascia di maturita', per leggere il totale. */
function latoInFascia(
  artefatto: ArtefattoModello,
  valoreAtteso: number,
  fascia: string | null,
): ProiezioneDiProduzione {
  const previsto = latoPrevisto(artefatto, valoreAtteso);
  return { ...previsto, evidenze: { ...previsto.evidenze, fascia } };
}

test('l\'affidabilita\' del totale si legge nella fascia piu\' povera dei due lati', () => {
  let verificati = 0;
  for (const caso of casi) {
    const artefatto = caricaArtefattoDaFile(resolve(CARTELLA, caso.artefatto));
    const dichiarata = artefatto.totale?.affidabilita;
    if (dichiarata === null || dichiarata === undefined) {
      continue;
    }
    verificati += 1;
    const prova = caso.prove[0];
    const dove = caso.target + ': ';

    // La fascia piu' povera fra quelle che questo bersaglio dichiara: su
    // shots_on_target la fascia EARLY non e' misurabile e non c'e', e non si finge.
    const fasce = artefatto.maturita?.per_fascia ?? {};
    const nomi = Object.keys(dichiarata.per_fascia);
    assert.ok(nomi.length >= 2, dove + 'servono almeno due fasce per questo confronto');
    const povera = nomi.reduce((meno, nome) => (fasce[nome].da < fasce[meno].da ? nome : meno));
    const ricca = nomi.reduce((piu, nome) => (fasce[nome].da > fasce[piu].da ? nome : piu));

    // Una squadra con poca storia e una con molta: comanda la piu' corta, perche' e'
    // quella che governa l'incertezza.
    const mista = totaleDiGara(
      artefatto,
      latoInFascia(artefatto, prova.atteso_casa, ricca),
      latoInFascia(artefatto, prova.atteso_trasferta, povera),
    );
    assert.ok(mista !== null && mista.affidabilita !== null, dove + 'affidabilita assente');
    assert.equal(mista.affidabilita.misuratoSu, 'fascia', dove + 'doveva leggere la fascia');
    assert.equal(
      mista.affidabilita.punteggio, dichiarata.per_fascia[povera].punteggio,
      dove + 'la fascia piu\' povera delle due e\' ' + povera + ', non ' + ricca,
    );
    assert.equal(mista.affidabilita.soglia, dichiarata.soglia_assoluta, dove + 'soglia');

    // Senza fascia dichiarata resta il complessivo: non si sceglie una fascia a caso.
    const senzaFascia = totaleDiGara(
      artefatto,
      latoInFascia(artefatto, prova.atteso_casa, null),
      latoInFascia(artefatto, prova.atteso_trasferta, null),
    );
    assert.ok(senzaFascia !== null && senzaFascia.affidabilita !== null, dove + 'complessivo');
    assert.equal(senzaFascia.affidabilita.misuratoSu, 'complessivo', dove + 'complessivo');
    assert.equal(
      senzaFascia.affidabilita.punteggio, dichiarata.complessivo.punteggio,
      dove + 'punteggio complessivo',
    );
  }
  assert.equal(verificati, 7, 'attesi sette artefatti con l\'affidabilita\' del totale');
});

test('il punteggio del totale nell\'artefatto e\' quello che Python ha misurato', () => {
  for (const caso of casi) {
    const artefatto = caricaArtefattoDaFile(resolve(CARTELLA, caso.artefatto));
    const dichiarata = artefatto.totale?.affidabilita;
    assert.ok(dichiarata !== null && dichiarata !== undefined, caso.target + ': assente');
    const rapporto = JSON.parse(readFileSync(
      resolve(CARTELLA, '..', caso.target + '-totale-affidabilita.json'), 'utf8',
    )) as {
      soglia_assoluta: number;
      punteggio: number;
      per_fascia: Record<string, { punteggio: number }>;
    };
    const dove = caso.target + ': ';
    assert.equal(dichiarata.soglia_assoluta, rapporto.soglia_assoluta, dove + 'soglia');
    assert.equal(dichiarata.complessivo.punteggio, rapporto.punteggio, dove + 'punteggio');
    for (const nome of Object.keys(dichiarata.per_fascia)) {
      assert.equal(
        dichiarata.per_fascia[nome].punteggio, rapporto.per_fascia[nome].punteggio,
        dove + 'punteggio della fascia ' + nome,
      );
    }
  }
});

test('le cinque soglie stanno a mezzo punto e sono ordinate', () => {
  for (const atteso of [0.4, 1.2, 5.0, 12.7, 25.3]) {
    const soglie = soglieDi(atteso);
    assert.equal(soglie.length, 5, 'le linee sono cinque');
    for (let indice = 0; indice < soglie.length; indice += 1) {
      assert.equal(
        Math.abs(soglie[indice] % 1), 0.5,
        'una soglia intera renderebbe possibile il pareggio con la soglia',
      );
      if (indice > 0) {
        assert.ok(soglie[indice] > soglie[indice - 1], 'le soglie sono crescenti');
      }
    }
    const centrale = soglie[2];
    assert.ok(
      Math.abs(centrale - (Math.round(atteso) - 0.5)) < 1e-12,
      'la soglia centrale e\' l\'atteso arrotondato meno mezzo',
    );
  }
});

test('le probabilita\' di una linea sommano a uno e decrescono con la soglia', () => {
  const caso = casi[0];
  const artefatto = caricaArtefattoDaFile(resolve(CARTELLA, caso.artefatto));
  const linee = lineeDiLato(artefatto, latoPrevisto(artefatto, 4.2));
  assert.ok(linee !== null);
  for (let indice = 0; indice < linee.length; indice += 1) {
    const somma = linee[indice].probabilitaSotto + linee[indice].probabilitaSopra;
    assert.ok(Math.abs(somma - 1) < 1e-12, 'sotto piu\' sopra deve fare uno');
    if (indice > 0) {
      assert.ok(
        linee[indice].probabilitaSopra <= linee[indice - 1].probabilitaSopra,
        'la probabilita\' di superare non puo\' crescere con la soglia',
      );
    }
  }
});

test('i confronti sono stati fatti davvero, non saltati', () => {
  assert.ok(confrontate >= 200, 'coppie confrontate: ' + String(confrontate));
});
