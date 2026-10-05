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
  rispostaSuiGiocatori,
  rispostaSuiGol,
  rispostaSuiPrecedenti,
  rispostaSullaClassifica,
  rispostaSullaForma,
  rispostaSulleFormazioni,
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

// --- Giocatori, formazioni, classifica, forma, precedenti.

const candidato = (nome: string, squadra: string, stima: number) => ({
  nome, squadra, stima, fattore: "tiri", valore: 3.2, incertezza: 1.5, gare: 6,
});
const LETTURA = {
  marcatori: [candidato("Rossi", "Monza", 0.31), candidato("Verdi", "Sassuolo", 0.27), candidato("Neri", "Monza", 0.22)],
  cartellini: [candidato("Bianchi", "Sassuolo", 0.24)],
};

test("i temi nuovi si leggono con il loro aspetto e il loro lato", () => {
  assert.deepEqual(leggiDomanda({ tema: "giocatori", aspetto: "marcatori", lato: "casa" }),
    { tema: "giocatori", aspetto: "marcatori", lato: "casa" });
  assert.deepEqual(leggiDomanda({ tema: "giocatori", aspetto: "indisponibili" }),
    { tema: "giocatori", aspetto: null, lato: "totale" });
  assert.deepEqual(leggiDomanda({ tema: "formazioni", aspetto: "indisponibili", lato: "trasferta" }),
    { tema: "formazioni", indisponibili: true, lato: "trasferta" });
  assert.deepEqual(leggiDomanda({ tema: "forma", bersaglio: "fouls" }), { tema: "forma" });
});

test("i marcatori sono quelli della lettura, filtrati per squadra, con la loro incertezza", () => {
  const letta = leggiDomanda({ tema: "giocatori", aspetto: "marcatori", lato: "casa" });
  assert.ok(letta !== null && letta.tema === "giocatori");
  const risposta = rispostaSuiGiocatori(letta, LETTURA, SQUADRE);
  assert.deepEqual(risposta.righe.map((r) => r.etichetta), ["Rossi · gol", "Neri · gol"]);
  assert.equal(risposta.righe[0].valore, "31%");
  assert.match(risposta.righe[0].nota ?? "", /3,2 tiri ogni 90' su 6 gare · ±1,5 punti/);

  const tutti = leggiDomanda({ tema: "giocatori" });
  assert.ok(tutti !== null && tutti.tema === "giocatori");
  assert.equal(rispostaSuiGiocatori(tutti, LETTURA, SQUADRE).righe.length, 4);
  // Senza lettura, o senza un nome di quella squadra, non si indica nessuno.
  assert.equal(rispostaSuiGiocatori(tutti, null, SQUADRE).righe.length, 0);
  const gialliCasa = leggiDomanda({ tema: "giocatori", aspetto: "cartellini", lato: "casa" });
  assert.ok(gialliCasa !== null && gialliCasa.tema === "giocatori");
  assert.match(rispostaSuiGiocatori(gialliCasa, LETTURA, SQUADRE).spiegazione, /non c'è un nome da indicare/);
});

test("le formazioni dichiarano se sono previste, e gli assenti che l'elenco e' in prova", () => {
  const formazioni = {
    ufficiali: false, inProva: true,
    casa: { modulo: "4-3-3", titolari: ["Uno", "Due"], indisponibili: [{ nome: "Tre", stato: "infortunato", motivo: "ginocchio" }] },
    trasferta: null,
  };
  const undici = leggiDomanda({ tema: "formazioni" });
  assert.ok(undici !== null && undici.tema === "formazioni");
  const risposta = rispostaSulleFormazioni(undici, formazioni, SQUADRE);
  assert.deepEqual(risposta.righe, [{ etichetta: "Monza", valore: "4-3-3", nota: "Uno, Due" }]);
  assert.match(risposta.spiegazione, /non ancora ufficiali/);

  const assenti = leggiDomanda({ tema: "formazioni", aspetto: "indisponibili" });
  assert.ok(assenti !== null && assenti.tema === "formazioni");
  const chiManca = rispostaSulleFormazioni(assenti, formazioni, SQUADRE);
  assert.deepEqual(chiManca.righe, [{ etichetta: "Tre", valore: "infortunato", nota: "Monza · ginocchio" }]);
  assert.match(chiManca.spiegazione, /in prova/);
  assert.match(rispostaSulleFormazioni(undici, null, SQUADRE).spiegazione, /non ha ancora le formazioni/);
});

test("classifica, forma e precedenti non trasformano un vuoto in uno zero", () => {
  const riga = { position: 3, played: 8, won: 5, drawn: 2, lost: 1, goalsFor: 14, goalsAgainst: 6, points: 17 };
  const classifica = rispostaSullaClassifica(
    { home: riga, away: { ...riga, position: 11, goalsFor: null }, teams: 20, seasonName: "2026/27" }, SQUADRE,
  );
  assert.deepEqual(classifica.righe[0], {
    etichetta: "Monza", valore: "3ª", nota: "17 punti · 8 giocate · 5 V 2 N 1 P · gol 14-6",
  });
  assert.equal(classifica.righe[1].nota, "17 punti · 8 giocate · 5 V 2 N 1 P");
  assert.equal(rispostaSullaClassifica(null, SQUADRE).righe.length, 0);

  const gara = { opponent: "Empoli", atHome: true, goalsFor: 2, goalsAgainst: 1, outcome: "V" as const };
  const forma = rispostaSullaForma([gara, { ...gara, atHome: false, outcome: "P" as const }], null, SQUADRE);
  assert.deepEqual(forma.righe, [{ etichetta: "Monza", valore: "V P", nota: "2-1 in casa con Empoli · 2-1 fuori con Empoli" }]);
  assert.equal(rispostaSullaForma(null, [], SQUADRE).righe.length, 0);

  const precedenti = rispostaSuiPrecedenti({
    totalMatches: 3, homeWins: 1, draws: null, awayWins: 2, avgTotalGoals: 2.67,
    recent: [{ date: null, home: "Monza", away: "Sassuolo", score: "1-2" }],
  }, SQUADRE);
  assert.deepEqual(precedenti.righe.map((r) => r.valore), ["1", "0", "2", "2,7"]);
  assert.match(precedenti.spiegazione, /Gli ultimi: Monza 1-2 Sassuolo\. Sono pochi/);
  assert.equal(rispostaSuiPrecedenti(null, SQUADRE).righe.length, 0);
});

test("un numero intero diventa soglia dalla parola che lo precede, e senza parola si butta", () => {
  const soglie = (domanda: string, ...numeri: number[]) =>
    leggiRichiesta({ bersaglio: "fouls", soglie: numeri }, domanda)?.soglie;
  assert.deepEqual(soglie("il Sassuolo fa più di 4 tiri in porta?", 4), [4.5]);
  assert.deepEqual(soglie("Monza almeno 5 corner", 5), [4.5]);
  assert.deepEqual(soglie("meno di 25 falli nella partita?", 25), [24.5]);
  assert.deepEqual(soglie("al massimo 3 gialli per il Sassuolo", 3), [3.5]);
  assert.deepEqual(soglie("sotto i 2 fuorigioco per gli ospiti", 2), [1.5]);
  assert.deepEqual(soglie("oltre 9 corner in tutta la gara", 9), [9.5]);
  // Una soglia gia' col mezzo punto non si tocca, qualunque parola abbia davanti.
  assert.deepEqual(soglie("conviene l'under 4,5, meno di 4,5 corner?", 4.5), [4.5]);
  // «12 volte» senza una parola che dica da che parte: non e' una soglia.
  assert.deepEqual(soglie("il Monza tira 12 volte?", 12), []);
  // La virgola di una frase non e' un decimale; quella di «4,5» si'.
  assert.deepEqual(soglie("più di 4, giusto?", 4), [4.5]);
  assert.deepEqual(soglie("più di 4,5 tiri", 4), []);
  // «più di 4» non deve agganciare il 4 di «più di 45».
  assert.deepEqual(soglie("più di 45 falli", 4), []);
});
