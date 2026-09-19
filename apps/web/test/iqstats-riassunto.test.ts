import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { GaraExpected } from "../src/server/iqstats/expected-famiglie.ts";
import { frasiDellaGara } from "../src/server/iqstats/riassunto-gara.ts";

const artefatto = JSON.parse(readFileSync(
  new URL("../src/server/iqstats/artefatti/expected-famiglie.json", import.meta.url), "utf8",
)) as { readonly gare: readonly GaraExpected[] };

test("su ogni gara dell'artefatto il riassunto non scrive mai un valore mancante", () => {
  for (const g of artefatto.gare) {
    for (const frase of frasiDellaGara(g, g.consigliato === null ? null : "lettura")) {
      assert.doesNotMatch(frase, /NaN|undefined|null|Infinity/, `${g.gara}: ${frase}`);
      assert.match(frase, /\.$/, `${g.gara}: ${frase}`);
    }
  }
});

test("equilibrio, tono dei gol e assenze seguono le soglie dichiarate", () => {
  const gara = {
    casa: "Casa", fuori: "Ospite", consigliato: null, esiti: [],
    attesi: [{ bersaglio: "total_shots", casa: 12, trasferta: 11.5, totale: 23.5 }],
    gol: {
      nostri: {
        attesiCasa: 1.2, attesiTrasferta: 1.1, campioneCasa: 4, campioneTrasferta: 5,
        esito: { uno: 0.36, x: 0.3, due: 0.34 }, gg: 0.52,
        overUnder: [{ linea: 2.5, sopra: 0.6, sotto: 0.4 }],
      },
    },
  } as unknown as GaraExpected;
  const frasi = frasiDellaGara(gara, null);
  assert.equal(frasi[0], "Gara in equilibrio: 36% Casa, 34% Ospite, pareggio al 30%.");
  assert.match(frasi[1], /^Gara da tanti gol: 2,3 in tutto/);
  assert.match(frasi[2], /^Tiri attesi in equilibrio: 12 contro 12\.$/);
  // Falli e gialli assenti: la frase disciplinare non si scrive, nessuno zero al suo posto.
  assert.equal(frasi.some((f) => f.includes("disciplinare")), false);
  assert.match(frasi.at(-1) ?? "", /4 gare in casa e 5 fuori/);
});
