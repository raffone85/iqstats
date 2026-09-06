// Prove del dossier: i due tempi, il ritmo e la convergenza dei segnali.
// Nessuna connessione: le funzioni che contano sono pure e si provano da sole.
//
// Quello che verificano davvero e' la disciplina, non l'aritmetica: che una gara successiva
// al calcio d'inizio **non entri** nelle medie che la leggono, che una metrica coperta a
// meta' resti fuori invece di valere zero, e che due letture discordi producano un
// conflitto dichiarato invece di una media che le annacqua.
import assert from "node:assert/strict";
import test from "node:test";

import { matchIntelligence } from "../src/server/iqstats/match-intelligence.ts";
import { posizione } from "../src/server/iqstats/ritmo.ts";
import { mediana } from "../src/server/iqstats/statistica.ts";
import {
  attesiDelTempo,
  esitiAllIntervallo,
  golDelTempo,
  medie,
  primaDi,
  type RigaGara,
  type TempiDellaGara,
} from "../src/server/iqstats/tempi.ts";

const CASA = 100;
const OSPITE = 200;

/** Una gara con il punteggio all'intervallo e quello finale. */
function gara(
  quando: string,
  golCasaPt: number,
  golTrasfertaPt: number,
  golCasa: number,
  golTrasferta: number,
  casaId = CASA,
  trasfertaId = OSPITE,
): RigaGara {
  return { quando, casaId, trasfertaId, golCasa, golTrasferta, golCasaPt, golTrasfertaPt };
}

// ---------------------------------------------------------------- primo tempo

test("primo tempo · i gol del tempo escono dal punteggio all'intervallo", () => {
  const g = gara("2026-08-01T18:00:00Z", 1, 0, 3, 2);
  assert.deepEqual(golDelTempo(g, "primo"), { casa: 1, trasferta: 0 });
  // Il secondo tempo e' la differenza: due gol della casa e due dell'ospite.
  assert.deepEqual(golDelTempo(g, "secondo"), { casa: 2, trasferta: 2 });
});

test("primo tempo · con i dati presenti le frequenze sono quelle contate", () => {
  const righe = [
    gara("2026-08-01T18:00:00Z", 1, 0, 2, 1),
    gara("2026-08-08T18:00:00Z", 0, 0, 1, 1),
    gara("2026-08-15T18:00:00Z", 2, 1, 3, 1),
    gara("2026-08-22T18:00:00Z", 0, 1, 0, 2),
  ];
  const m = medie(righe, "primo", CASA);
  assert.equal(m.gare, 4);
  // Gol segnati dalla casa nel primo tempo: 1 + 0 + 2 + 0 = 3 su 4 gare.
  assert.equal(m.segnati, 0.75);
  assert.equal(m.subiti, 0.5);
  // Tre gare su quattro hanno almeno un gol nel primo tempo.
  assert.equal(m.conGol, 0.75);
  // Una sola ne ha almeno due, ed e' la stessa in cui hanno segnato entrambe.
  assert.equal(m.overUnoCinque, 0.25);
  assert.equal(m.entrambe, 0.25);
});

test("primo tempo · senza gare le medie non inventano numeri", () => {
  const vuoto = medie([], "primo", CASA);
  assert.equal(vuoto.gare, 0);
  assert.equal(vuoto.conGol, 0);
  assert.equal(esitiAllIntervallo([], CASA), null, "sotto il minimo non si legge un esito");
  assert.equal(
    esitiAllIntervallo([gara("2026-08-01T18:00:00Z", 1, 0, 1, 0)], CASA),
    null,
    "una gara sola non e' una frequenza",
  );
});

test("primo tempo · il lato conta: la stessa gara letta dai due lati si ribalta", () => {
  const righe = [
    gara("2026-08-01T18:00:00Z", 2, 0, 2, 0),
    gara("2026-08-08T18:00:00Z", 1, 0, 1, 0),
    gara("2026-08-15T18:00:00Z", 1, 0, 2, 0),
    gara("2026-08-22T18:00:00Z", 0, 0, 1, 1),
  ];
  const dallaCasa = medie(righe, "primo", CASA);
  const dallOspite = medie(righe, "primo", OSPITE);
  assert.equal(dallaCasa.segnati, 1);
  assert.equal(dallaCasa.subiti, 0);
  // Specchiate: quello che una segna, l'altra lo subisce.
  assert.equal(dallOspite.segnati, dallaCasa.subiti);
  assert.equal(dallOspite.subiti, dallaCasa.segnati);
});

test("primo tempo · gli esiti all'intervallo si contano dal punto di vista giusto", () => {
  const righe = [
    gara("2026-08-01T18:00:00Z", 2, 0, 2, 0),
    gara("2026-08-08T18:00:00Z", 0, 0, 1, 1),
    gara("2026-08-15T18:00:00Z", 0, 1, 1, 2),
    gara("2026-08-22T18:00:00Z", 1, 0, 1, 0),
  ];
  const casa = esitiAllIntervallo(righe, CASA);
  assert.ok(casa);
  assert.equal(casa.avanti, 0.5);
  assert.equal(casa.pari, 0.25);
  assert.equal(casa.sotto, 0.25);
  const ospite = esitiAllIntervallo(righe, OSPITE);
  assert.ok(ospite);
  assert.equal(ospite.avanti, casa.sotto, "gli esiti si ribaltano fra i due lati");
});

// ---------------------------------------------------------------- secondo tempo

test("secondo tempo · un tempo senza gol resta a zero senza rompere gli attesi", () => {
  const righe = [
    gara("2026-08-01T18:00:00Z", 1, 1, 1, 1),
    gara("2026-08-08T18:00:00Z", 2, 0, 2, 0),
    gara("2026-08-15T18:00:00Z", 0, 1, 0, 1),
    gara("2026-08-22T18:00:00Z", 1, 0, 1, 0),
  ];
  const m = medie(righe, "secondo", CASA);
  assert.equal(m.conGol, 0, "in queste quattro gare nel secondo tempo non si segna mai");
  // Senza gol nel tempo non c'e' un metro di lega: gli attesi restano assenti, non zero.
  assert.equal(attesiDelTempo(m, m, m), null);
});

test("secondo tempo · con un metro di lega gli attesi sono finiti e positivi", () => {
  const casa = { gare: 10, segnati: 0.9, subiti: 0.6, conGol: 0.7, overUnoCinque: 0.3, entrambe: 0.2 };
  const trasferta = { gare: 10, segnati: 0.7, subiti: 0.8, conGol: 0.6, overUnoCinque: 0.2, entrambe: 0.1 };
  const lega = { gare: 120, segnati: 1.5, subiti: 0, conGol: 0.72, overUnoCinque: 0.34, entrambe: 0.18 };
  const attesi = attesiDelTempo(casa, trasferta, lega);
  assert.ok(attesi);
  for (const v of [attesi.casa, attesi.trasferta]) {
    assert.ok(Number.isFinite(v) && v > 0, `atteso non valido: ${v}`);
  }
  // Chi segna di piu' contro chi concede di piu' resta davanti.
  assert.ok(attesi.casa > attesi.trasferta);
});

// ---------------------------------------------------------------- anti-leakage

test("anti-leakage · la gara da leggere non entra mai nelle medie che la leggono", () => {
  const kickoff = "2026-09-02T18:00:00Z";
  const righe = [
    gara("2026-08-26T18:00:00Z", 1, 0, 2, 0),
    gara(kickoff, 5, 5, 9, 9), // la gara stessa: se entrasse, si vedrebbe subito
    gara("2026-09-09T18:00:00Z", 4, 4, 8, 8), // e nemmeno una successiva
  ];
  const ammesse = primaDi(righe, kickoff);
  assert.equal(ammesse.length, 1);
  assert.equal(ammesse[0].quando, "2026-08-26T18:00:00Z");
  // La prova che sa diventare rossa: senza il filtro la media esploderebbe.
  assert.equal(medie(ammesse, "primo", CASA).segnati, 1);
  assert.ok(medie(righe, "primo", CASA).segnati > 3, "senza filtro il numero e' un altro");
});

test("anti-leakage · una data illeggibile non lascia passare niente", () => {
  assert.deepEqual(primaDi([gara("2026-08-01T18:00:00Z", 1, 0, 1, 0)], "non-una-data"), []);
});

// ---------------------------------------------------------------- ritmo

test("ritmo · la posizione e' la quota di chi sta sotto, non un punteggio inventato", () => {
  const campionato = [4, 6, 8, 10, 12];
  assert.equal(posizione(11, campionato), 0.8);
  assert.equal(posizione(4, campionato), 0);
  assert.equal(posizione(13, campionato), 1);
  // Senza distribuzione non si finge una posizione: si sta in mezzo.
  assert.equal(posizione(7, []), 0.5);
});

test("ritmo · la mediana regge il numero pari di valori, e il caso vuoto", () => {
  assert.equal(mediana([1, 3]), 2);
  assert.equal(mediana([5, 1, 3]), 3);
  // Prima esistevano due mediane, e questa tornava NaN sul vuoto invece di dichiararlo.
  assert.equal(mediana([]), null);
});

// ---------------------------------------------------------------- segnali

/** Un dossier dei tempi costruito a mano, con le due frequenze che decidono tutto. */
function tempiFinti(conGolCasa: number, conGolTrasferta: number, conGolLega: number): TempiDellaGara {
  const blocco = (conGol: number) => ({
    gare: 12, segnati: 0.8, subiti: 0.7, conGol, overUnoCinque: 0.3, entrambe: 0.2,
  });
  const perTempo = (conGol: number) => ({ primo: blocco(conGol), secondo: blocco(conGol) });
  return {
    casa: {
      nome: "Casa", lato: "casa", stagione: perTempo(conGolCasa),
      ultime5: perTempo(conGolCasa), ultime10: null,
      intervallo: { avanti: 0.4, pari: 0.4, sotto: 0.2 },
    },
    trasferta: {
      nome: "Ospite", lato: "trasferta", stagione: perTempo(conGolTrasferta),
      ultime5: null, ultime10: null, intervallo: null,
    },
    lega: perTempo(conGolLega),
    gareDiLega: 120,
    mercati: {
      primo: {
        overUnder: [{ linea: 0.5, sopra: 0.74, sotto: 0.26 }],
      } as unknown as TempiDellaGara["mercati"]["primo"],
      secondo: null,
    },
    fasce: "DATA_NOT_AVAILABLE",
  };
}

test("segnali · quattro letture d'accordo fanno una convergenza forte", () => {
  const dossier = matchIntelligence({
    tempi: tempiFinti(0.78, 0.71, 0.7),
    bersagli: [],
    nomiBersagli: {},
    picks: [],
  });
  assert.ok(dossier.principale);
  assert.equal(dossier.principale.convergenza, "forte");
  assert.equal(dossier.conflitti.length, 0);
  // L'affidabilita' dei mercati dei gol non e' misurata, e resta assente: mai «alta».
  assert.equal(dossier.principale.affidabilita, null);
});

test("segnali · una lettura contraria produce un conflitto dichiarato, non una media", () => {
  // La casa segna spesso nel primo tempo, l'ospite quasi mai: le due si contraddicono.
  const dossier = matchIntelligence({
    tempi: tempiFinti(0.8, 0.3, 0.7),
    bersagli: [],
    nomiBersagli: {},
    picks: [],
  });
  assert.equal(dossier.principale, null, "un conflitto non diventa il segnale principale");
  assert.equal(dossier.conflitti.length, 1);
  assert.equal(dossier.conflitti[0].convergenza, "conflitto");
});

test("segnali · senza dati il dossier resta vuoto invece di riempirsi", () => {
  const dossier = matchIntelligence({ tempi: null, bersagli: [], nomiBersagli: {}, picks: [] });
  assert.equal(dossier.principale, null);
  assert.equal(dossier.secondo, null);
  assert.equal(dossier.tutti.length, 0);
  assert.equal(dossier.candidatoDiValore, null);
});

test("segnali · il valore resta separato dal segnale e non lo sostituisce", () => {
  const dossier = matchIntelligence({
    tempi: tempiFinti(0.78, 0.71, 0.7),
    bersagli: [],
    nomiBersagli: {},
    picks: [
      {
        area: "gioco", label: "Più di 9,5 corner", probability: 70, marketProbability: 58,
        odds: 1.72, edge: 12, reliability: 74, sample: 12, solida: true, marketQuoted: true,
        note: "prova",
      },
      {
        area: "esito", label: "Casa avanti", probability: 60, marketProbability: 59,
        odds: 1.69, edge: 1, reliability: null, sample: null, solida: false, marketQuoted: true,
        note: "prova",
      },
    ],
  });
  assert.ok(dossier.candidatoDiValore);
  // Vince il margine piu' largo, e non e' il segnale principale.
  assert.equal(dossier.candidatoDiValore.label, "Più di 9,5 corner");
  assert.notEqual(dossier.candidatoDiValore.label, dossier.principale?.titolo);
});
