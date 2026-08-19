/**
 * Test di parita' sul calcolo delle feature «al momento di».
 *
 * La domanda e' la stessa del test sul predittore, spostata piu' indietro: partendo
 * dalla stessa storia, i due linguaggi calcolano le stesse feature? Se la risposta e'
 * no, la previsione sara' sbagliata anche con un predittore perfetto.
 *
 * Il campione di riscontro lo scrive scripts/projection/models/export_asof.py: contiene
 * l'ingresso cosi' come il predittore lo ricevera' e le feature che il lato che addestra
 * ha calcolato da quell'ingresso.
 *
 * Esecuzione: npm run test:asof
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { calcolaFeature, gruppiNecessari, gruppoDi } from '../asof/calcolo';
import { esponenziale, media, deviazione, campione } from '../asof/aggregati';
import type { IngressoFeature } from '../asof/contratto';

const CARTELLA = resolve(__dirname, '..', '..', 'models', 'output', 'artefatti');
const CODA = '-riscontro-asof.json';

/** Tolleranze del piano di validazione: relativa sulle grandezze derivate. */
const TOLLERANZA_RELATIVA = 1e-9;
const TOLLERANZA_ASSOLUTA = 1e-9;

interface Prova {
  readonly event_id: number;
  readonly lato: string;
  readonly ingresso: IngressoFeature;
  readonly attese: Record<string, number | null>;
}

interface Riscontro {
  readonly target: string;
  readonly colonne: readonly string[];
  readonly prove: readonly Prova[];
}

function riscontri(): Riscontro[] {
  if (!existsSync(CARTELLA)) {
    return [];
  }
  const trovati: Riscontro[] = [];
  for (const nome of readdirSync(CARTELLA)) {
    if (nome.endsWith(CODA)) {
      trovati.push(JSON.parse(readFileSync(resolve(CARTELLA, nome), 'utf8')) as Riscontro);
    }
  }
  return trovati;
}

function vicini(ottenuto: number, atteso: number): boolean {
  const assoluta = Math.abs(ottenuto - atteso);
  if (assoluta <= TOLLERANZA_ASSOLUTA) {
    return true;
  }
  const scala = Math.max(Math.abs(atteso), 1e-12);
  return assoluta / scala <= TOLLERANZA_RELATIVA;
}

test('le primitive replicano la libreria che addestra', () => {
  // Gli stessi numeri verificati contro pandas: la finestra conta le gare, non i
  // valori noti, e la media esponenziale non salta i valori ignoti.
  const serie = [2, null, 3, 1, null, 4];
  assert.equal(media(serie, 3), 2.5);
  assert.equal(media([2, null, 3], 3), 2.5);
  assert.equal(campione([2, null, 3], 3), 2);
  assert.ok(Math.abs((deviazione([2, null, 3]) ?? 0) - 0.5) < 1e-12);
  const atteso = 2.6933823816416;
  assert.ok(Math.abs((esponenziale(serie) ?? 0) - atteso) < 1e-9);
});

test('una finestra piu' + ' lunga della storia usa tutta la storia', () => {
  assert.equal(media([1, 2], 10), 1.5);
  assert.equal(media([], 3), null);
  assert.equal(esponenziale([]), null);
  assert.equal(media([null, null]), null);
});

test('ogni colonna appartiene a un gruppo, e uno solo', () => {
  assert.equal(gruppoDi('prodotto_stagione_media'), 'base');
  assert.equal(gruppoDi('prodotto_ultime5_media'), 'forma');
  assert.equal(gruppoDi('prodotto_lato_media'), 'casa_trasferta');
  assert.equal(gruppoDi('concesso_lato_media'), 'avversario');
  assert.equal(gruppoDi('avv_giorni_di_riposo'), 'avversario');
  assert.equal(gruppoDi('giorni_di_riposo'), 'riposo');
  assert.equal(gruppoDi('arbitro_severita_falli'), 'arbitro');
  assert.equal(gruppoDi('spaziale_quota_in_area_concesso'), 'spaziale');
  assert.equal(gruppoDi('interazione_casa_severita_arbitro'), 'interazione');
  assert.equal(gruppoDi('colonna_inventata'), null);
});

test('si calcolano solo i gruppi che le colonne richiedono', () => {
  const necessari = gruppiNecessari(['baseline_lega', 'arbitro_campione']);
  assert.deepEqual(necessari.sort(), ['arbitro', 'base']);
  assert.throws(() => gruppiNecessari(['colonna_inventata']), /senza gruppo/);
});

const tutti = riscontri();

test('i campioni di riscontro esistono e sono popolati', () => {
  assert.ok(tutti.length > 0, 'nessun campione in ' + CARTELLA);
  for (const riscontro of tutti) {
    assert.ok(riscontro.prove.length > 0, riscontro.target);
    assert.ok(riscontro.colonne.length > 0, riscontro.target);
  }
});

for (const riscontro of tutti) {
  test('le feature di ' + riscontro.target + ' coincidono con quelle di chi addestra', () => {
    const colonne = riscontro.colonne.slice();
    let numeriche = 0;
    let confrontate = 0;
    const divergenti: string[] = [];

    for (const prova of riscontro.prove) {
      const ottenute = calcolaFeature(prova.ingresso, colonne);
      for (const colonna of colonne) {
        const atteso = prova.attese[colonna];
        const ottenuto = ottenute[colonna];
        confrontate += 1;
        if (atteso === null || atteso === undefined) {
          if (ottenuto !== null) {
            divergenti.push(colonna + ' attesa assente, ottenuta ' + String(ottenuto));
          }
          continue;
        }
        if (ottenuto === null) {
          divergenti.push(colonna + ' attesa ' + String(atteso) + ', ottenuta assente');
          continue;
        }
        numeriche += 1;
        if (!vicini(ottenuto, atteso)) {
          divergenti.push(
            colonna + ' attesa ' + String(atteso) + ', ottenuta ' + String(ottenuto),
          );
        }
      }
    }

    // Un test che confronta soltanto assenze non prova nulla: si pretende che la
    // grande maggioranza dei confronti sia fra due numeri veri.
    assert.ok(confrontate > 0, 'nessun confronto');
    assert.ok(
      numeriche / confrontate >= 0.9,
      'solo ' + String(numeriche) + ' confronti numerici su ' + String(confrontate),
    );
    assert.deepEqual(divergenti.slice(0, 12), [], 'divergenze: ' + String(divergenti.length));
  });
}

test('una colonna dichiarata e non prodotta ferma il calcolo', () => {
  if (tutti.length === 0) {
    return;
  }
  const prova = tutti[0].prove[0];
  assert.throws(
    () => calcolaFeature(prova.ingresso, ['baseline_lega', 'arbitro_inesistente_media']),
    /dichiarate e non prodotte|senza gruppo/,
  );
});

test('senza storia le feature sono assenti, mai zero', () => {
  const vuoto: IngressoFeature = {
    quando: '2026-01-01T00:00:00Z',
    lato: 'home',
    stagione: 1,
    turno: null,
    derby: null,
    squadra: [],
    avversario: [],
    lega: {
      media: null,
      sd: null,
      latoMedia: null,
      latoCampione: null,
      falli: null,
      ammoniti: null,
      espulsioni: null,
    },
  };
  const uscita = calcolaFeature(vuoto, [
    'prodotto_stagione_media',
    'baseline_restringimento',
    'giorni_di_riposo',
  ]);
  assert.equal(uscita.prodotto_stagione_media, null);
  assert.equal(uscita.baseline_restringimento, null);
  assert.equal(uscita.giorni_di_riposo, null);
});
