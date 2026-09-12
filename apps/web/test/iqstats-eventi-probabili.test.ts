// L'elenco degli eventi piu' probabili: che cosa entra, in quale ordine, e cosa resta fuori.
//
// Il criterio e' quello di produzione esteso ai mercati dei gol, scelto il 12 settembre 2026
// dopo la misura di `consuntivo-gol.ts` su 1.200 gare chiuse. Qui si verificano le tre
// regole che lo tengono onesto: il tetto all'80%, una riga per famiglia, e i due mercati
// bocciati dal consuntivo - esito 1X2 a -12,4 punti e gol/nogol a -3,8 - che non devono
// comparire in nessun caso. Il caso del multigol «1-6 al 90%» c'e' perche' e' quello che
// aprirebbe l'elenco se il tetto cadesse.
import assert from "node:assert/strict";
import test from "node:test";

import type { MercatiGol } from "../src/server/iqstats/projection/gol.ts";
import {
  eventiProbabili, famigliaDi, type EventoProbabile,
} from "../src/server/iqstats/projection/eventi-probabili.ts";
import type { LetturaForte } from "../src/server/iqstats/projection/letture-forti.ts";

function lettura(bersaglio: string, probabilita: number, affidabilita = 70): LetturaForte {
  return {
    bersaglio, lato: "totale", soglia: 9.5, verso: "Over", probabilita,
    decisione: Math.abs(probabilita - 0.5), base: 60, gareDiBase: 200, squadre: [],
    affidabilita, righeDiProva: 300, sorpresa: 0.1, forza: 0.07,
  };
}

function mercati(pezzi: Partial<MercatiGol> = {}): MercatiGol {
  return {
    esito: { uno: 0.45, x: 0.28, due: 0.27 },
    doppiaChance: { unoX: 0.73, xDue: 0.55, unoDue: 0.72 },
    overUnder: [
      { linea: 1.5, sopra: 0.78, sotto: 0.22 },
      { linea: 2.5, sopra: 0.52, sotto: 0.48 },
    ],
    gg: 0.54,
    ng: 0.46,
    multigolPartita: [
      { da: 1, a: 6, probabilita: 0.9 },
      { da: 2, a: 4, probabilita: 0.62 },
      { da: 1, a: 3, probabilita: 0.58 },
    ],
    casa: { multigol: [{ da: 0, a: 1, probabilita: 0.64 }, { da: 1, a: 2, probabilita: 0.55 }] },
    trasferta: { multigol: [{ da: 0, a: 1, probabilita: 0.71 }] },
    ...pezzi,
  } as unknown as MercatiGol;
}

const voceDi = (e: EventoProbabile) => (e.da === "gol" ? e.voce : `${e.verso} ${e.soglia}`);

test("il tetto all'80% tiene fuori il multigol che direbbe l'ovvio", () => {
  const elenco = eventiProbabili([], mercati());
  const multigol = elenco.filter((e) => famigliaDi(e) === "multigol-partita");
  assert.equal(multigol.length, 1);
  // Il 90% e' escluso: entra il 62%, che dice qualcosa.
  assert.equal(voceDi(multigol[0]!), "2-4");
  assert.equal(multigol[0]!.probabilita, 0.62);
});

test("i due mercati bocciati dal consuntivo non entrano mai", () => {
  const elenco = eventiProbabili([], mercati(), 20);
  const famiglie = elenco.map(famigliaDi);
  assert.equal(famiglie.includes("esito"), false);
  assert.equal(famiglie.includes("gol-nogol"), false);
  // I quattro ammessi ci sono tutti, uno per famiglia.
  assert.deepEqual(
    [...famiglie].sort(),
    ["doppia-chance", "multigol-partita", "multigol-squadra", "over-under"],
  );
});

test("una riga per famiglia, anche quando il mercato ne offre molte", () => {
  const elenco = eventiProbabili([], mercati(), 20);
  const perFamiglia = new Map<string, number>();
  for (const e of elenco) perFamiglia.set(famigliaDi(e), (perFamiglia.get(famigliaDi(e)) ?? 0) + 1);
  for (const [famiglia, quante] of perFamiglia) {
    assert.equal(quante, 1, `${famiglia} ha ${quante} righe`);
  }
  // Il multigol di squadra prende il lato piu' probabile, non uno per squadra.
  const squadra = elenco.find((e) => famigliaDi(e) === "multigol-squadra")!;
  assert.equal(squadra.da === "gol" ? squadra.lato : null, "trasferta");
  assert.equal(squadra.probabilita, 0.71);
});

test("l'ordine e' per punto percentuale, e a parita' vince chi sa quanto regge", () => {
  const elenco = eventiProbabili([lettura("corner_kicks", 0.71)], mercati(), 20);
  const punti = elenco.map((e) => Math.round(e.probabilita * 100));
  assert.deepEqual(punti, [...punti].sort((a, b) => b - a));
  // A 71 punti stanno la lettura dei corner e il multigol di trasferta: passa la lettura,
  // che porta un'affidabilita' misurata.
  const a71 = elenco.filter((e) => Math.round(e.probabilita * 100) === 71);
  assert.equal(a71.length, 2);
  assert.equal(a71[0]!.da, "famiglia");
  assert.equal(a71[1]!.da, "gol");
});

test("senza mercati dei gol l'elenco resta di sole famiglie", () => {
  // Su 1.200 gare chiuse i mercati c'erano su 314: la gara senza gol attesi non e' un caso
  // limite, e' tre gare su quattro.
  const elenco = eventiProbabili([lettura("corner_kicks", 0.74), lettura("offsides", 0.66)], null);
  assert.equal(elenco.length, 2);
  assert.equal(elenco.every((e) => e.da === "famiglia"), true);
  assert.equal(famigliaDi(elenco[0]!), "corner_kicks");
});

test("il taglio a sei righe, e le letture sopra il tetto non passano", () => {
  const letture = [
    lettura("corner_kicks", 0.79), lettura("offsides", 0.77), lettura("total_shots", 0.75),
    lettura("goalkeeper_saves", 0.73), lettura("yellow_cards", 0.7),
    // Sopra il tetto: `ordinaLetture` non la produrrebbe, ma se arrivasse va scartata.
    lettura("shots_on_target", 0.85),
  ];
  const elenco = eventiProbabili(letture, mercati());
  assert.equal(elenco.length, 6);
  assert.equal(elenco.every((e) => e.probabilita <= 0.8), true);
  assert.equal(elenco.map(famigliaDi).includes("shots_on_target"), false);
});
