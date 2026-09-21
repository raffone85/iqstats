// La taratura della promessa: corregge il numero mostrato, non l'ordine.
//
// La correzione viene dall'artefatto `taratura-promessa.json`, stimato su gare chiuse:
// queste prove non ne ricopiano i valori, controllano il verso e l'invarianza dell'ordine.
import assert from "node:assert/strict";
import test from "node:test";

import { arricchisci, ordinaLetture } from "../src/server/iqstats/projection/letture-forti.ts";
import type { LetturaForte } from "../src/server/iqstats/projection/letture-forti.ts";
import { promessaTarata } from "../src/server/iqstats/projection/taratura-promessa.ts";

function linea(bersaglio: string, probabilita: number): LetturaForte {
  return {
    bersaglio, lato: "totale", soglia: 9.5, verso: "Over", probabilita,
    decisione: Math.abs(probabilita - 0.5), base: null, gareDiBase: null, squadre: [],
    affidabilita: 80, righeDiProva: 500, sorpresa: 0, forza: 0, promessa: probabilita,
  };
}

test("senza base di lega la promessa resta quella del motore", () => {
  assert.equal(promessaTarata(0.72, null), 0.72);
});

test("sotto la norma la promessa sale, molto sopra la norma scende", () => {
  // 68% contro una lega che sta al 75: la lettura e' sotto la norma.
  assert.ok(promessaTarata(0.68, 75) > 0.68);
  // 72% contro una lega che sta al 50: venti punti di scarto.
  assert.ok(promessaTarata(0.72, 50) < 0.72);
});

test("la promessa resta una probabilita'", () => {
  for (const [p, base] of [[0.02, 99], [0.99, 1], [0.5, 50]] as const) {
    const v = promessaTarata(p, base);
    assert.ok(v >= 0 && v <= 1, `fuori da [0,1]: ${v}`);
  }
});

test("la taratura non cambia l'ordine delle letture", () => {
  const basi = new Map([
    ["corner|totale|9.5|Over", { quota: 50, gare: 200 }],
    ["tiri|totale|9.5|Over", { quota: 78, gare: 200 }],
  ]);
  const candidate = [linea("corner", 0.73), linea("tiri", 0.71)];
  const arricchite = arricchisci(candidate, basi);
  const ordinate = ordinaLetture(candidate, [], basi);
  // La prima resta quella con la probabilita' piu' alta, anche se la sua promessa tarata
  // e' piu' bassa: il criterio non legge `promessa`.
  assert.equal(ordinate.letture[0]?.bersaglio, "corner");
  const corner = arricchite.find((l) => l.bersaglio === "corner");
  const tiri = arricchite.find((l) => l.bersaglio === "tiri");
  assert.ok(corner !== undefined && tiri !== undefined);
  assert.ok(corner.probabilita > tiri.probabilita);
  assert.ok(corner.promessa < tiri.promessa, "il caso da spiegare in pagina non si verifica piu'");
});
