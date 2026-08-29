// Prove della verifica predetto contro reale: pure, senza livello dati.
//
// Quello che verificano sono le tre regole che, se saltassero, farebbero di questa sezione
// una pagella truccata: **preso vuol dire dentro l'intervallo dichiarato**, il totale e' la
// **somma dei due lati osservati**, e cio' che non si puo' giudicare **non conta come
// sbagliato** ma si dichiara.
import assert from "node:assert/strict";
import test from "node:test";

import { verificaDellaGara } from "../src/server/iqstats/verifica.ts";
import type { RealeDiGara } from "../src/server/iqstats/verifica.ts";
import type { ProiezioneDiGara } from "../src/server/iqstats/projection/match.ts";

/** Un bersaglio con i tre lati previsti e i loro intervalli. */
function bersaglio(
  target: string,
  casa: [number, number, number] | null,
  trasferta: [number, number, number] | null,
  totale: [number, number, number] | null,
): ProiezioneDiGara {
  const lato = (v: [number, number, number] | null) => (v === null
    ? { stato: "assente" as const, perche: "" }
    : {
      stato: "prevista" as const,
      valoreAtteso: v[0],
      intervallo: { basso: v[1], alto: v[2], livelloNominale: 0.8 },
      affidabilita: null,
      perche: "",
      linee: null,
    });
  return {
    target,
    modelId: "prova",
    casa: lato(casa) as unknown as ProiezioneDiGara["casa"],
    trasferta: lato(trasferta) as unknown as ProiezioneDiGara["trasferta"],
    totale: totale === null ? null : {
      valoreAtteso: totale[0],
      intervallo: { basso: totale[1], alto: totale[2], livelloNominale: 0.8 },
      linee: null,
      affidabilita: null,
      perche: "",
    },
    linee: { casa: null, trasferta: null },
  } as unknown as ProiezioneDiGara;
}

function reale(casa: Record<string, number | null>, fuori: Record<string, number | null>): RealeDiGara {
  return { casa, fuori };
}

test("preso vuol dire dentro l'intervallo, non vicino", () => {
  const v = verificaDellaGara(
    [bersaglio("corner", [5, 3, 7], null, null)],
    reale({ corner: 7 }, { corner: 4 }),
  );
  assert.equal(v?.gruppi[0].voci[0].dentro, true, "sette con intervallo 3-7 e' dentro");

  const fuoriDiPoco = verificaDellaGara(
    [bersaglio("corner", [5, 3, 7], null, null)],
    reale({ corner: 8 }, { corner: 4 }),
  );
  assert.equal(fuoriDiPoco?.gruppi[0].voci[0].dentro, false, "otto e' fuori, anche se di uno");
});

test("il totale e' la somma dei due lati osservati", () => {
  const v = verificaDellaGara(
    [bersaglio("total_shots", null, null, [22, 18, 26])],
    reale({ total_shots: 13 }, { total_shots: 9 }),
  );
  assert.equal(v?.totali, 1);
  assert.equal(v?.gruppi[0].voci[0].lato, "totale");
  assert.equal(v?.gruppi[0].voci[0].reale, 22);
  assert.equal(v?.gruppi[0].voci[0].dentro, true);
});

test("il conteggio somma solo le voci giudicate", () => {
  const v = verificaDellaGara(
    [
      bersaglio("corner", [5, 3, 7], [4, 2, 6], [9, 7, 11]),
      bersaglio("fouls", [12, 10, 14], null, null),
    ],
    reale({ corner: 7, fouls: 20 }, { corner: 4, fouls: 11 }),
  );
  // Tre voci dei corner (tutte dentro) piu' una dei falli, fuori.
  assert.equal(v?.totali, 4);
  assert.equal(v?.presi, 3);
  // E le voci stanno in due famiglie, ciascuna col suo parziale.
  assert.equal(v?.gruppi.length, 2);
  assert.equal(v?.gruppi[0].presi, 3);
  assert.equal(v?.gruppi[1].presi, 0);
});

test("cio' che non si puo' giudicare non conta come sbagliato, e si dichiara", () => {
  // Il bersaglio previsto ma non osservato non entra fra le voci.
  const senzaOsservazione = verificaDellaGara(
    [bersaglio("offsides", [2, 1, 3], null, null)],
    reale({ offsides: null }, { offsides: null }),
  );
  assert.equal(senzaOsservazione, null);

  // Il bersaglio osservato ma senza intervallo finisce fra i non giudicati.
  const senzaIntervallo = verificaDellaGara(
    [bersaglio("corner", [5, 3, 7], null, null), bersaglio("fouls", null, null, null)],
    reale({ corner: 5, fouls: 12 }, { corner: 4, fouls: 11 }),
  );
  assert.equal(senzaIntervallo?.totali, 1);
  assert.deepEqual(senzaIntervallo?.senzaGiudizio, ["fouls"]);
});

test("senza osservazioni della gara non si verifica niente", () => {
  assert.equal(verificaDellaGara([bersaglio("corner", [5, 3, 7], null, null)], null), null);
  assert.equal(verificaDellaGara([], reale({ corner: 5 }, { corner: 4 })), null);
});
