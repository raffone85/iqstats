// Prove dell'assistente della gara. Niente rete e niente modello: si verifica cio' che sta
// fra la risposta del modello e la pagina, cioe' che un JSON non fidato diventi una
// richiesta o niente, e che i numeri escano dal motore e dai prezzi, non dal testo.
import assert from "node:assert/strict";
import test from "node:test";

import {
  leggiDomanda,
  leggiRichiesta,
  probabilitaSuSoglia,
  rispostaRiassunto,
  rispostaSuiGol,
  rispostaSulleLinee,
  rispostaSullArbitro,
} from "../src/server/iqstats/assistente-gara.ts";
import { mercatiGol } from "../src/server/iqstats/projection/gol.ts";
import type { GolDellaGara } from "../src/server/iqstats/projection-runtime.ts";
import { vociDeiGol } from "../src/server/iqstats/voci-dei-gol.ts";
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

// --- I temi oltre le linee: gol, arbitro, riassunto.

const GOL = {
  mercati: mercatiGol(1.6, 1.1), campioneCasa: 4, campioneTrasferta: 5, campioneLega: 80,
  xgCasa: null, xgTrasferta: null, xgLegaCasa: null, xgLegaTrasferta: null,
} as GolDellaGara;
/** Solo Fastbet, e solo sull'esito: il resto deve dire «senza prezzo». */
const FASTBET = {
  esito: { uno: 2.1, x: 3.4, due: 3.9 }, doppiaChance: null, overUnder: [],
  gol: null, noGol: null, multigolPartita: [], multigolCasa: [], multigolTrasferta: [],
};
const VOCI = vociDeiGol(GOL.mercati, null, FASTBET);
const gol = (mercato: string | null, lato = "totale", verso = "over", soglie: number[] = []) => {
  const letta = leggiDomanda({ tema: "gol", mercato, lato, verso, soglie });
  assert.ok(letta !== null && letta.tema === "gol");
  return rispostaSuiGol(letta, GOL, VOCI, SQUADRE);
};

test("il tema decide chi risponde, e senza tema una famiglia vera resta una linea", () => {
  assert.deepEqual(leggiDomanda({ tema: "arbitro", bersaglio: "fouls" }), { tema: "arbitro" });
  assert.deepEqual(leggiDomanda({ tema: "riassunto" }), { tema: "riassunto" });
  assert.equal(leggiDomanda({ tema: "linee", bersaglio: null }), null);
  assert.equal(leggiDomanda({ tema: null }), null);
  assert.equal(leggiDomanda({ bersaglio: "fouls", soglie: [24.5] })?.tema, "linee");
  // Un mercato che non esiste non blocca la domanda: diventa «i gol in generale».
  assert.deepEqual(
    leggiDomanda({ tema: "gol", mercato: "handicap", lato: "casa", soglie: [2.5, 3] }),
    { tema: "gol", mercato: null, lato: "casa", verso: "Over", soglie: [2.5] },
  );
});

test("l'esito porta le stesse probabilita' dei mercati, con quota e valore dove c'e' il prezzo", () => {
  const risposta = gol("esito");
  assert.deepEqual(risposta.righe.map((r) => r.etichetta), ["1 · Monza", "X · pareggio", "2 · Sassuolo"]);
  assert.equal(risposta.righe[0].valore, `${Math.round(GOL.mercati.esito.uno * 100)}%`);
  assert.match(risposta.righe[0].nota ?? "", /^quota 2,10 · /);
  assert.match(risposta.spiegazione, /4 gare in casa di Monza e 5 fuori casa di Sassuolo/);
});

test("senza prezzo lo dice, e una linea che il motore non calcola non si inventa", () => {
  assert.equal(gol("gol_nogol").righe[0].nota, "senza prezzo");
  const dueEMezzo = gol("over_under", "totale", "over", [2.5]);
  assert.deepEqual(dueEMezzo.righe.map((r) => r.etichetta), ["Over 2,5"]);
  const sotto = gol("over_under", "totale", "under", [2.5]);
  const linea = GOL.mercati.overUnder.find((l) => l.linea === 2.5);
  assert.equal(sotto.righe[0].valore, `${Math.round((linea?.sotto ?? 0) * 100)}%`);
  const assente = gol("over_under", "totale", "over", [9.5]);
  assert.equal(assente.righe.length, 0);
  assert.match(assente.spiegazione, /quella chiesta non è fra queste/);
});

test("i gol di una squadra, i multigol e il risultato escono dai mercati", () => {
  const casa = gol(null, "casa");
  assert.equal(casa.titolo, "I gol di Monza");
  assert.equal(casa.righe[1].valore, `${Math.round(GOL.mercati.casa.almenoUno * 100)}%`);
  assert.ok(gol("multigol").righe.length <= 6);
  assert.equal(gol("risultato").righe[0].etichetta,
    `${GOL.mercati.risultati[0].casa}-${GOL.mercati.risultati[0].trasferta}`);
  assert.equal(gol(null).righe.length, 4);
});

test("senza mercati dei gol non esce nessun numero", () => {
  const letta = leggiDomanda({ tema: "gol", mercato: "esito" });
  assert.ok(letta !== null && letta.tema === "gol");
  const risposta = rispostaSuiGol(letta, null, null, SQUADRE);
  assert.equal(risposta.righe.length, 0);
  assert.match(risposta.spiegazione, /Nessun numero viene stimato/);
});

test("l'arbitro: medie accanto ai colleghi, effetto col segno, assenza dichiarata", () => {
  const risposta = rispostaSullArbitro({
    nome: "Guida",
    profilo: {
      gare: 22, media: { falli: 26.4, gialli: 4.5, rossi: 0.18 },
      metro: { falli: 24.1, gialli: 4.02, rossi: 0.2 }, gialliControCasa: 2.1, gialliControTrasferta: 2.4,
    },
    giudizio: "severo",
    influenza: [{ famiglia: "falli", effetto: 0.08 }, { famiglia: "cartellini gialli", effetto: -0.03 }],
  }, SQUADRE);
  assert.equal(risposta.titolo, "L'arbitro: Guida");
  assert.deepEqual(risposta.righe[1], { etichetta: "Falli a gara", valore: "26,4", nota: "colleghi 24,1" });
  assert.equal(risposta.righe.find((r) => r.etichetta === "Effetto su falli")?.valore, "+8%");
  assert.equal(risposta.righe.find((r) => r.etichetta === "Effetto su cartellini gialli")?.valore, "−3%");
  assert.match(risposta.spiegazione, /è severo rispetto a loro/);

  const senzaNome = rispostaSullArbitro({ nome: null, profilo: null, giudizio: null, influenza: [] }, SQUADRE);
  assert.equal(senzaNome.righe.length, 0);
  assert.match(senzaNome.spiegazione, /non ha ancora designato/);
  const senzaStoria = rispostaSullArbitro({ nome: "Rossi", profilo: null, giudizio: null, influenza: [] }, SQUADRE);
  assert.match(senzaStoria.spiegazione, /non abbiamo abbastanza gare/);
  assert.match(senzaStoria.spiegazione, /non sposta nessuna famiglia/);
});

test("il riassunto ripete le frasi del dossier e non ne aggiunge", () => {
  assert.equal(rispostaRiassunto(["Prima frase.", "Seconda frase."]).spiegazione, "Prima frase. Seconda frase.");
  assert.match(rispostaRiassunto([]).spiegazione, /non c'è un riassunto/);
});
