// Prove del punto in cui probabilita' e quota si incontrano. Nessuna connessione: e'
// aritmetica su dati costruiti a mano.
//
// Quello che verificano e' la distinzione che il sistema deve conservare: **probabilita',
// margine, affidabilita' e solidita' sono quattro cose diverse**. Una lettura molto
// probabile puo' non avere margine; una con margine puo' non essere solida; e dove la
// quota manca il margine non e' zero, non esiste. Se queste prove passassero anche
// confondendo i quattro concetti, non varrebbero niente.
import assert from "node:assert/strict";
import test from "node:test";

import { buildMatchPicks, comparabileDaGol, type MatchPick } from "../src/server/iqstats/match-picks.ts";
import type { MatchOdds } from "../src/server/iqstats/odds.ts";
import type { MercatiGol } from "../src/server/iqstats/projection/gol.ts";
import type { ProiezioneDiGara } from "../src/server/iqstats/projection/match.ts";
import type {
  EvidenzeDiAffidabilita,
  LivelloDiAffidabilita,
  ProiezioneDiProduzione,
} from "../src/server/iqstats/projection/production.ts";
import type { StatEngineResult } from "../src/server/iqstats/stat-engine.ts";

const SENZA_MOTORE_DI_BASE: StatEngineResult = { available: false, reason: "league_not_calibrated" };

/** Un mercato con una sola quota, gia' con la sua implicita. */
function quote(mercato: string, chiave: string, quota: number, implicita: number): MatchOdds {
  return {
    bookmakers: 9,
    updatedAt: "2026-09-02T10:00:00Z",
    markets: {
      [mercato]: [
        { key: chiave, label: null, consensusOdds: quota, impliedProb: implicita, drift: null, books: 9 },
      ],
    },
  };
}

function affidabilita(punteggio: number, soglia: number): LivelloDiAffidabilita {
  return {
    punteggio,
    punteggioBasso: punteggio - 3,
    punteggioAlto: punteggio + 3,
    fasciaDiLettura: "da 8 a 14 gare",
    soglia,
    misuratoSu: "fascia",
    righeDiProva: 240,
  };
}

function evidenze(garePrecedenti: number | null): EvidenzeDiAffidabilita {
  return {
    livello: null,
    perche: "prova",
    fascia: "da 8 a 14 gare",
    garePrecedenti,
    garePrecedentiAvversario: garePrecedenti,
    maeFuoriCampione: 1.9,
    erroreStandardDelMae: 0.1,
    biasFuoriCampione: 0.02,
    righeDiProva: 240,
    righeDiAddestramentoNellaFascia: 1200,
    stabilitaMisurabile: true,
    feature: "complete",
    formazione: "non disponibile: le formazioni non sono raccolte",
  };
}

function lato(gare: number | null): ProiezioneDiProduzione {
  return {
    stato: "prevista",
    target: "corner_kicks",
    modelId: "corner_kicks__poisson_glm",
    modelVersion: "1",
    valoreAtteso: 5.2,
    intervallo: null,
    origineDelValore: "modello",
    pesoDelModello: 1,
    ripiegoUsato: false,
    copertura: "piena",
    campioneDiAddestramento: 4200,
    evidenze: evidenze(gare),
  };
}

/**
 * Un bersaglio del motore con una linea dichiarata sulla soglia 9,5.
 * `probabilitaSopra` decide che cosa la lettura sceglie e con quale forza.
 */
function bersaglioCorner(
  probabilitaSopra: number,
  livello: LivelloDiAffidabilita | null,
  gare: number | null = 12,
): ProiezioneDiGara {
  return {
    target: "corner_kicks",
    modelId: "corner_kicks__poisson_glm",
    casa: lato(gare),
    trasferta: lato(gare),
    linee: { casa: null, trasferta: null },
    totale: {
      valoreAtteso: 10.4,
      intervallo: null,
      linee: [{ soglia: 9.5, probabilitaSopra, probabilitaSotto: 1 - probabilitaSopra }],
      affidabilita: livello,
      perche: "prova",
    },
    scartoDiCalibrazioneDelleLinee: null,
  };
}

function corner(picks: readonly MatchPick[]): MatchPick {
  const trovata = picks.find((p) => p.area === "gioco");
  assert.ok(trovata, "la lettura di gioco doveva esserci");
  return trovata;
}

// ---------------------------------------------------------------- i sette casi

test("1 · probabilita' alta e quota favorevole danno un margine positivo", () => {
  // Il modello dice 70%, il mercato ne prezza 58: dodici punti di margine.
  const picks = buildMatchPicks(
    null,
    SENZA_MOTORE_DI_BASE,
    quote("total_corners", "over@9.5", 1.72, 58),
    "Casa",
    "Ospite",
    [bersaglioCorner(0.7, affidabilita(74, 60))],
  );
  const scelta = corner(picks);
  assert.equal(scelta.probability, 70);
  assert.equal(scelta.marketProbability, 58);
  assert.equal(scelta.edge, 12);
  assert.equal(scelta.odds, 1.72);
  assert.equal(scelta.solida, true);
});

test("2 · probabilita' alta ma quota che la prezza meglio non produce margine", () => {
  // Stessa lettura al 70%, ma il mercato la prezza al 76: il margine e' negativo e la
  // lettura non e' solida, per quanto sia probabile.
  const picks = buildMatchPicks(
    null,
    SENZA_MOTORE_DI_BASE,
    quote("total_corners", "over@9.5", 1.32, 76),
    "Casa",
    "Ospite",
    [bersaglioCorner(0.7, affidabilita(74, 60))],
  );
  const scelta = corner(picks);
  assert.equal(scelta.edge, -6);
  assert.equal(scelta.solida, false);
});

test("3 · dati insufficienti non producono un falso valore", () => {
  // Nessun bersaglio, nessun motore di base, nessuna previsione: nessuna lettura.
  const picks = buildMatchPicks(null, SENZA_MOTORE_DI_BASE, null, "Casa", "Ospite", []);
  assert.equal(picks.length, 0);
  // Una linea troppo fiacca non entra: sotto la soglia utile la lettura non dice niente.
  const fiacca = buildMatchPicks(
    null,
    SENZA_MOTORE_DI_BASE,
    quote("total_corners", "over@9.5", 1.9, 40),
    "Casa",
    "Ospite",
    [bersaglioCorner(0.51, affidabilita(74, 60))],
  );
  assert.equal(fiacca.length, 0);
});

test("4 · senza quote il sistema regge e dichiara l'assenza invece di inventare uno zero", () => {
  const picks = buildMatchPicks(null, SENZA_MOTORE_DI_BASE, null, "Casa", "Ospite", [
    bersaglioCorner(0.7, affidabilita(74, 60)),
  ]);
  const scelta = corner(picks);
  assert.equal(scelta.probability, 70);
  assert.equal(scelta.marketProbability, null);
  assert.equal(scelta.odds, null);
  // Il margine non e' zero: e' assente. Zero direbbe «modello e mercato concordano».
  assert.equal(scelta.edge, null);
  assert.equal(scelta.solida, false);
});

test("5 · affidabilita' sotto la propria soglia non rende solida una lettura con margine", () => {
  const picks = buildMatchPicks(
    null,
    SENZA_MOTORE_DI_BASE,
    quote("total_corners", "over@9.5", 1.72, 58),
    "Casa",
    "Ospite",
    [bersaglioCorner(0.7, affidabilita(52, 60))],
  );
  const scelta = corner(picks);
  assert.equal(scelta.edge, 12, "il margine resta quello che e'");
  assert.equal(scelta.reliability, 52);
  assert.equal(scelta.solida, false, "sotto la soglia dell'artefatto non si dichiara solida");

  // E senza affidabilita' misurata affatto, nemmeno: l'assenza non vale come promozione.
  const senzaCurva = buildMatchPicks(
    null,
    SENZA_MOTORE_DI_BASE,
    quote("total_corners", "over@9.5", 1.72, 58),
    "Casa",
    "Ospite",
    [bersaglioCorner(0.7, null)],
  );
  const seconda = corner(senzaCurva);
  assert.equal(seconda.reliability, null);
  assert.equal(seconda.solida, false);
});

test("6 · il margine e' la differenza fra le due probabilita', nel verso giusto", () => {
  for (const [modello, mercato, atteso] of [
    [0.64, 55, 9],
    [0.5, 50, 0],
    [0.6, 71.5, -11.5],
  ] as const) {
    const picks = buildMatchPicks(
      null,
      SENZA_MOTORE_DI_BASE,
      quote("total_corners", modello >= 0.5 ? "over@9.5" : "under@9.5", 1.6, mercato),
      "Casa",
      "Ospite",
      [bersaglioCorner(modello, affidabilita(74, 60))],
    );
    if (modello * 100 < 58) {
      // Sotto la soglia utile la lettura non compare affatto: e' il caso 3, non il 6.
      assert.equal(picks.length, 0);
      continue;
    }
    assert.equal(corner(picks).edge, atteso);
  }
});

test("7 · nessun NaN, nessun infinito, nessuna probabilita' impossibile", () => {
  const picks = buildMatchPicks(
    { probHome: 62, probDraw: 22, probAway: 16, probOver25: 61, probBtts: 55 },
    SENZA_MOTORE_DI_BASE,
    quote("1x2", "HOME", 1.55, 59),
    "Casa",
    "Ospite",
    [bersaglioCorner(0.68, affidabilita(74, 60))],
    14,
  );
  assert.ok(picks.length >= 2);
  for (const p of picks) {
    for (const numero of [p.probability, p.marketProbability, p.odds, p.edge, p.reliability, p.sample]) {
      if (numero === null) continue;
      assert.ok(Number.isFinite(numero), `${p.label}: ${numero} non e' finito`);
    }
    assert.ok(p.probability >= 0 && p.probability <= 100, `${p.label}: probabilita' fuori scala`);
    if (p.marketProbability !== null) {
      assert.ok(p.marketProbability >= 0 && p.marketProbability <= 100);
    }
    if (p.edge !== null) assert.ok(Math.abs(p.edge) <= 100);
  }
});

// ---------------------------------------------------------------- l'adattatore

test("i nostri mercati dei gol entrano nel confronto senza riscrivere il confronto", () => {
  const mercati = {
    esito: { uno: 0.48, x: 0.27, due: 0.25 },
    doppiaChance: { unoX: 0.75, xDue: 0.52, unoDue: 0.73 },
    overUnder: [
      { linea: 1.5, sopra: 0.78, sotto: 0.22 },
      { linea: 2.5, sopra: 0.54, sotto: 0.46 },
    ],
    gg: 0.57,
    ng: 0.43,
    attesiTotali: 2.7,
    totaliMinimo: 1,
    totaliMassimo: 4,
    casa: {
      attesi: 1.5, minimo: 0, massimo: 3, esatti: [], almenoUno: 0.78, almenoDue: 0.44, multigol: [],
    },
    trasferta: {
      attesi: 1.2, minimo: 0, massimo: 2, esatti: [], almenoUno: 0.7, almenoDue: 0.34, multigol: [],
    },
    risultati: [],
    multigolPartita: [],
  } as unknown as MercatiGol;

  const comparabile = comparabileDaGol(mercati);
  // Le percentuali escono in centesimi, come le vuole il confronto gia' esistente.
  assert.equal(comparabile.probHome, 48);
  assert.equal(comparabile.probDraw, 27);
  assert.equal(comparabile.probAway, 25);
  assert.equal(comparabile.probOver25, 54);
  assert.equal(comparabile.probBtts, 57);
});

test("senza la linea 2,5 fra gli over la soglia dei gol resta assente, non zero", () => {
  const senza25 = {
    esito: { uno: 0.4, x: 0.3, due: 0.3 },
    overUnder: [{ linea: 1.5, sopra: 0.8, sotto: 0.2 }],
    gg: 0.5,
  } as unknown as MercatiGol;
  assert.equal(comparabileDaGol(senza25).probOver25, null);
});
