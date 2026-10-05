// Prove dell'assistente della gara. Niente rete e niente modello: si verifica cio' che sta
// fra la risposta del modello e la pagina, cioe' che un JSON non fidato diventi una
// richiesta o niente, e che i numeri escano dal motore e dai prezzi, non dal testo.
import assert from "node:assert/strict";
import test from "node:test";

import {
  leggiRichiesta,
  probabilitaSuSoglia,
  rispostaSulleLinee,
} from "../src/server/iqstats/assistente-gara.ts";
import type { RigaQuotata } from "../src/server/iqstats/expected-famiglie.ts";
import type { ProiezioneDiGara } from "../src/server/iqstats/projection/match.ts";

const SQUADRE = { casa: "Monza", trasferta: "Sassuolo" };

/** Tiri: 12 attesi in casa, 10 in trasferta. Le linee non servono vuote: basta che ci siano. */
const TIRI = {
  target: "total_shots",
  casa: { stato: "prevista", valoreAtteso: 12 },
  trasferta: { stato: "prevista", valoreAtteso: 10 },
  linee: { casa: [], trasferta: [] },
  totale: { valoreAtteso: 22, linee: [] },
} as unknown as ProiezioneDiGara;

function quota(soglia: number, verso: string, prezzo: number): RigaQuotata {
  return {
    bersaglio: "total_shots", lato: "trasferta", soglia, verso, quota: prezzo,
    probabilita: null, atteso: 10, fuoriFinestra: false,
  };
}

test("il JSON del modello diventa una richiesta solo se nomina una famiglia vera", () => {
  assert.deepEqual(
    leggiRichiesta({ bersaglio: "total_shots", lato: "trasferta", verso: "over", soglie: [9.5, 8.5] }),
    { bersaglio: "total_shots", lato: "trasferta", verso: "Over", soglie: [8.5, 9.5] },
  );
  assert.equal(leggiRichiesta({ bersaglio: null }), null);
  assert.equal(leggiRichiesta({ bersaglio: "goals" }), null);
  assert.equal(leggiRichiesta("total_shots"), null);
  assert.equal(leggiRichiesta(null), null);
});

test("lato e verso mancanti ripiegano su totale e Over, le soglie sbagliate si buttano", () => {
  assert.deepEqual(
    leggiRichiesta({ bersaglio: "fouls", lato: "ospiti", soglie: [9, "8.5", -1.5, 250.5, 4.5, 4.5] }),
    { bersaglio: "fouls", lato: "totale", verso: "Over", soglie: [4.5] },
  );
  assert.equal(leggiRichiesta({ bersaglio: "fouls", soglie: [1.5, 2.5, 3.5, 4.5, 5.5] })?.soglie.length, 4);
});

test("la probabilita' scende con la soglia e dichiara quando esce dalla finestra", () => {
  const a = probabilitaSuSoglia(TIRI, "trasferta", 8.5);
  const b = probabilitaSuSoglia(TIRI, "trasferta", 9.5);
  const lontana = probabilitaSuSoglia(TIRI, "trasferta", 15.5);
  assert.ok(a !== null && b !== null && lontana !== null);
  assert.ok(a.sopra > b.sopra && b.sopra > lontana.sopra);
  assert.equal(a.atteso, 10);
  // Le cinque soglie attorno a 10 attesi vanno da 7,5 a 11,5.
  assert.equal(a.fuoriFinestra, false);
  assert.equal(lontana.fuoriFinestra, true);
  // Il totale e' un'altra grandezza: 22 attesi, non 10.
  assert.equal(probabilitaSuSoglia(TIRI, "totale", 21.5)?.atteso, 22);
});

test("la soglia senza prezzo lo dice, quella quotata porta quota e valore", () => {
  const risposta = rispostaSulleLinee(
    { bersaglio: "total_shots", lato: "trasferta", verso: "Over", soglie: [8.5, 9.5] },
    [TIRI],
    [quota(9.5, "Over", 2.1), quota(9.5, "Under", 1.7)],
    SQUADRE,
  );
  assert.equal(risposta.capito, true);
  assert.equal(risposta.titolo, "Over tiri di Sassuolo");
  assert.deepEqual(risposta.righe.map((r) => r.etichetta), ["Over 8,5", "Over 9,5"]);
  assert.match(risposta.righe[0].nota ?? "", /il banco non la quota/);
  assert.match(risposta.righe[1].nota ?? "", /quota 2,10/);
  assert.match(risposta.spiegazione, /Over 8,5 non ha un prezzo/);
  assert.match(risposta.spiegazione, /la nostra probabilità scende di \d+ punti/);
  // Ogni percentuale mostrata e' quella del motore su quella soglia.
  const attesa = Math.round((probabilitaSuSoglia(TIRI, "trasferta", 9.5)?.sopra ?? 0) * 100);
  assert.equal(risposta.righe[1].valore, `${attesa}%`);
});

test("l'Under e' il complemento dell'Over sulla stessa soglia", () => {
  const sopra = probabilitaSuSoglia(TIRI, "casa", 11.5)?.sopra ?? 0;
  const risposta = rispostaSulleLinee(
    { bersaglio: "total_shots", lato: "casa", verso: "Under", soglie: [11.5] }, [TIRI], [], SQUADRE,
  );
  assert.equal(risposta.righe[0].valore, `${Math.round((1 - sopra) * 100)}%`);
});

test("senza soglie si mostrano quelle del banco, e senza banco quelle del motore", () => {
  const conBanco = rispostaSulleLinee(
    { bersaglio: "total_shots", lato: "trasferta", verso: "Over", soglie: [] },
    [TIRI], [quota(10.5, "Over", 2.4)], SQUADRE,
  );
  assert.deepEqual(conBanco.righe.map((r) => r.etichetta), ["Over 10,5"]);
  const senzaBanco = rispostaSulleLinee(
    { bersaglio: "total_shots", lato: "trasferta", verso: "Over", soglie: [] }, [TIRI], [], SQUADRE,
  );
  assert.equal(senzaBanco.righe.length, 5);
});

test("una domanda non capita o una famiglia senza stima non producono numeri", () => {
  assert.equal(rispostaSulleLinee(null, [TIRI], [], SQUADRE).capito, false);
  const senzaStima = rispostaSulleLinee(
    { bersaglio: "fouls", lato: "totale", verso: "Over", soglie: [24.5] }, [TIRI], [], SQUADRE,
  );
  assert.equal(senzaStima.righe.length, 0);
  assert.match(senzaStima.spiegazione, /non ne invento una/);
});
