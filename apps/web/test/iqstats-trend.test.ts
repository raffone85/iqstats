// Prove del trend delle ultime gare: pure, senza livello dati.
//
// Quello che verificano e' la sola regola che rende il trend leggibile invece che rumoroso:
// **un salto conta quando supera l'errore delle due medie**, e fra due salti vince quello
// che l'errore regge meglio, non quello con la differenza piu' grande.
import assert from "node:assert/strict";
import test from "node:test";

import { saltiDelTrend } from "../src/server/iqstats/lati.ts";
import type { ConMetro, MedieDiLato, Trend, VoceDiLato, VoceDiTrend } from "../src/server/iqstats/lati.ts";

function conMetro(media: number, errore: number | null): ConMetro {
  return { media, mediaDiLega: media, dispersione: 1, posizione: 0.5, errore };
}

function voce(chiave: string, prodotto: number, errore: number | null = 0.3): VoceDiLato {
  return {
    chiave,
    nome: chiave,
    campione: 12,
    prodotto: conMetro(prodotto, errore),
    concesso: conMetro(10, errore),
  };
}

function medie(voci: readonly VoceDiLato[]): MedieDiLato {
  return { lato: "home", gare: 12, squadre: 20, voci, assenti: [] };
}

function recente(chiave: string, prodotto: number, errore: number | null = 0.3): VoceDiTrend {
  return {
    chiave,
    nome: chiave,
    prodotto,
    concesso: 10,
    erroreProdotto: errore,
    erroreConcesso: errore,
    campione: 5,
  };
}

function trend(voci: readonly VoceDiTrend[]): Trend {
  return { gare: 5, voci };
}

test("un salto dentro l'errore non e' un salto e resta fuori", () => {
  // Errore composto = radice di 0,3^2 + 0,3^2 = 0,424. Un salto di 0,4 non lo supera.
  const salti = saltiDelTrend(medie([voce("tiri", 12)]), trend([recente("tiri", 12.4)]));
  assert.deepEqual(salti.filter((s) => s.quale === "prodotto"), []);
});

test("un salto oltre l'errore entra, con il suo verso", () => {
  const salti = saltiDelTrend(medie([voce("tiri", 12)]), trend([recente("tiri", 14)]));
  const tiri = salti.find((s) => s.quale === "prodotto");
  assert.ok(tiri, "il salto dei tiri non c'e'");
  assert.equal(tiri.verso, 1);
  assert.equal(tiri.media, 12);
  assert.equal(tiri.ultime, 14);
  assert.equal(tiri.campione, 5);
  assert.ok(Math.abs(tiri.delta - 2) < 1e-9);

  const giu = saltiDelTrend(medie([voce("tiri", 12)]), trend([recente("tiri", 10)]));
  assert.equal(giu.find((s) => s.quale === "prodotto")?.verso, -1);
});

test("si ordina su quante volte l'errore vale il salto, non sul salto", () => {
  // Corner: salto 1,0 con errore piccolissimo. Tiri: salto 3,0 con errore grande.
  // Il salto piu' grande in valore assoluto e' quello dei tiri, ma il suo errore composto
  // vale 4,24 e non lo regge: resta fuori. Passa il corner, che salta venti volte l'errore.
  const salti = saltiDelTrend(
    medie([voce("tiri", 12, 3), voce("corner", 5, 0.05)]),
    trend([recente("tiri", 15, 3), recente("corner", 6, 0.05)]),
  );
  const primo = salti[0];
  assert.equal(primo.chiave, "corner");
  assert.ok(primo.forza > 10, `forza ${primo.forza}`);
  assert.deepEqual(
    salti.filter((s) => s.chiave === "tiri" && s.quale === "prodotto"),
    [],
    "tre tiri di salto con 4,24 di errore non sono un salto",
  );
});

test("senza uno dei due errori il salto non si dichiara", () => {
  const senzaBase = saltiDelTrend(medie([voce("tiri", 12, null)]), trend([recente("tiri", 20)]));
  assert.deepEqual(senzaBase, []);
  const senzaRecente = saltiDelTrend(medie([voce("tiri", 12)]), trend([recente("tiri", 20, null)]));
  assert.deepEqual(senzaRecente.filter((s) => s.quale === "prodotto"), []);
});

test("una metrica che il trend non porta non entra, e non diventa zero", () => {
  const salti = saltiDelTrend(medie([voce("parate", 3)]), trend([recente("tiri", 20)]));
  assert.deepEqual(salti, []);
});

test("fuori dalle sette famiglie del motore il trend non parla", () => {
  // Palle lunghe e intercetti hanno poca varianza e vincevano la classifica dei salti: veri,
  // ma non sono la lingua del prodotto. Visto in pagina il 29 agosto 2026.
  const fuori = saltiDelTrend(
    medie([voce("palle_lunghe", 40, 0.1)]),
    trend([recente("palle_lunghe", 50, 0.1)]),
  );
  assert.deepEqual(fuori, []);
  const dentro = saltiDelTrend(medie([voce("corner", 4, 0.1)]), trend([recente("corner", 6, 0.1)]));
  assert.equal(dentro.length > 0, true);
});

test("si mostrano al massimo i primi, e senza dati non si mostra niente", () => {
  const molte = ["tiri", "corner", "falli", "gialli", "parate"].map((k) => voce(k, 10, 0.1));
  const recenti = ["tiri", "corner", "falli", "gialli", "parate"].map((k, i) => recente(k, 12 + i, 0.1));
  assert.equal(saltiDelTrend(medie(molte), trend(recenti)).length, 3);
  assert.equal(saltiDelTrend(medie(molte), trend(recenti), 2).length, 2);
  assert.deepEqual(saltiDelTrend(null, trend(recenti)), []);
  assert.deepEqual(saltiDelTrend(medie(molte), null), []);
});

test("una famiglia compare una volta sola, con la sua faccia piu' forte", () => {
  // Fuorigioco saltava sia in quello che la squadra fa sia in quello che concede, e si
  // prendeva due righe su tre. Visto in pagina il 29 agosto 2026.
  const voci: VoceDiLato = {
    chiave: "fuorigioco",
    nome: "Fuorigioco",
    campione: 12,
    prodotto: conMetro(1.5, 0.1),
    concesso: conMetro(2.0, 0.1),
  };
  const salti = saltiDelTrend(
    medie([voci, voce("corner", 4, 0.1)]),
    trend([
      { chiave: "fuorigioco", nome: "Fuorigioco", prodotto: 1.0, concesso: 3.2,
        erroreProdotto: 0.1, erroreConcesso: 0.1, campione: 5 },
      recente("corner", 6, 0.1),
    ]),
  );
  assert.equal(salti.filter((s) => s.chiave === "fuorigioco").length, 1);
  // Il concesso salta di 1,2 e il prodotto di 0,5: resta il concesso.
  assert.equal(salti.find((s) => s.chiave === "fuorigioco")?.quale, "concesso");
});
