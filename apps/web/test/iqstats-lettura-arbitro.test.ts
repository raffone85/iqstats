// Prove della lettura arbitro della scheda squadra: pure, senza livello dati.
//
// Quello che verificano sono le tre regole che il pannello violava fino al 29 agosto 2026:
// **niente etichetta senza un campione**, **la soglia e' mezza dispersione fra i colleghi**
// e non un cinque per cento scelto a tavolino, e **niente etichetta senza un metro**.
import assert from "node:assert/strict";
import test from "node:test";

import { letturaArbitro } from "../src/server/iqstats/referees.ts";
import type { MetroDiLega, RigaClassifica } from "../src/server/iqstats/referees.ts";

/** Il metro della Serie A misurato il 29 agosto 2026: 391 gare, 25,3 falli, 3,60 gialli. */
function metro(parti: Partial<MetroDiLega> = {}): MetroDiLega {
  return {
    gialli: 3.6,
    falli: 25.3,
    dispersioneGialli: 0.8,
    dispersioneFalli: 2.0,
    quotaGialliCasa: null,
    dispersioneQuotaGialliCasa: null,
    quotaFalliCasa: null,
    dispersioneQuotaFalliCasa: null,
    gare: 391,
    arbitri: 20,
    dellaStagione: false,
    ...parti,
  };
}

function riga(parti: Partial<RigaClassifica> = {}): RigaClassifica {
  return {
    sourceId: 1,
    nome: "Un arbitro",
    paese: "Italy",
    gare: 16,
    falli: 25.3,
    gialli: 3.6,
    rossi: 0.1,
    ...parti,
  };
}

test("senza riga non c'e' lettura: un carattere non si deduce da un campione che non c'e'", () => {
  // `classificaArbitri` non restituisce chi sta sotto le cinque gare: senza riga, niente.
  assert.equal(letturaArbitro(null, metro()), null);
});

test("la soglia e' mezza dispersione, non una percentuale", () => {
  // Falli: mezza dispersione vale 1,0. A 26,2 lo scarto e' 0,9 e non basta; a 26,3 basta.
  assert.equal(letturaArbitro(riga({ falli: 26.2 }), metro())?.giudizioFalli, "in linea");
  assert.equal(letturaArbitro(riga({ falli: 26.3 }), metro())?.giudizioFalli, "severo");
  assert.equal(letturaArbitro(riga({ falli: 24.3 }), metro())?.giudizioFalli, "permissivo");
  // Con il vecchio criterio del cinque per cento, 26,2 su 25,3 e' uno scarto del 3,6% e
  // sarebbe finito «in linea» qui ma «severo» in una lega dove gli arbitri si somigliano.
  assert.equal(
    letturaArbitro(riga({ falli: 26.2 }), metro({ dispersioneFalli: 1.0 }))?.giudizioFalli,
    "severo",
  );
});

test("i due assi restano separati: si puo' fischiare molto e ammonire poco", () => {
  const lettura = letturaArbitro(riga({ falli: 28, gialli: 3.6 }), metro());
  assert.equal(lettura?.giudizioFalli, "severo");
  assert.equal(lettura?.giudizioGialli, "in linea");
});

test("senza metro o senza dispersione nessuna etichetta, ma le medie restano", () => {
  const senzaMetro = letturaArbitro(riga({ falli: 30 }), null);
  assert.equal(senzaMetro?.giudizioFalli, null);
  assert.equal(senzaMetro?.giudizioGialli, null);
  assert.equal(senzaMetro?.falli, 30);
  assert.equal(senzaMetro?.gare, 16);

  const senzaDispersione = letturaArbitro(riga({ falli: 30 }), metro({ dispersioneFalli: null }));
  assert.equal(senzaDispersione?.giudizioFalli, null);
  assert.equal(senzaDispersione?.giudizioGialli, "in linea");
});

// **Manca la prova del caso «falli non registrati», e non e' una dimenticanza.**
// `classificaArbitri` dichiara `falli: number` ma la query passa da `numero()`, che converte
// in **0** un `null` del livello dati: oggi quel caso non e' rappresentabile nel tipo, e in
// pagina uscirebbe «0,0 falli» al posto di «non lo sappiamo». E' il difetto opposto alla
// regola dei valori inventati, vive in `referees.ts` e va chiuso li', non aggirato qui.
