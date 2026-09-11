// Le quote del palinsesto: che cosa e' una linea, che cosa non lo e', e a quale gara va.
//
// I casi che contano sono tutti misurati sulla raccolta dell'11 settembre 2026:
// «U/O Tiri Totali + 1X2» e' una combinata e non una linea (5.370 mercati su quella
// raccolta, dieci volte i mercati puri); il lato sta nel nome del mercato e non negli
// esiti; la soglia sta nel nome dell'esito e non nel campo `linea`; gli esiti sospesi
// hanno quota zero e sono 13.319.
import assert from "node:assert/strict";
import test from "node:test";

import {
  agganciaGara,
  chiaveDiLinea,
  eventoQuotato,
  paroleDiSquadra,
  type EventoGrezzo,
} from "../src/server/iqstats/projection/quote.ts";

function mercato(
  nome: string,
  famiglia: string | null,
  esiti: ReadonlyArray<{ nome: string; quota: number }>,
  giocatore: string | null = null,
) {
  return { nome, famiglia, giocatore, esiti };
}

function evento(mercati: ReturnType<typeof mercato>[]): EventoGrezzo {
  return {
    casa: "Venezia",
    fuori: "Fiorentina",
    inizio: "2026-09-11T18:45:00Z",
    mercati,
  };
}

test("la soglia viene dal nome dell'esito, non dal campo del mercato", () => {
  const quotato = eventoQuotato(evento([
    mercato("U/O corners", "corner_kicks", [
      { nome: "Ov. 9.5", quota: 1.85 },
      { nome: "Un. 8.5", quota: 2.1 },
    ]),
  ]));
  const linee = quotato.linee.get(chiaveDiLinea("corner_kicks", "totale"));
  assert.deepEqual(linee, [
    { soglia: 8.5, verso: "Under", quota: 2.1 },
    { soglia: 9.5, verso: "Over", quota: 1.85 },
  ]);
});

test("il lato sta nel nome del mercato", () => {
  const quotato = eventoQuotato(evento([
    mercato("Casa U/O corners", "corner_kicks", [{ nome: "Ov. 4.5", quota: 2 }]),
    mercato("Ospite U/O corners", "corner_kicks", [{ nome: "Ov. 4.5", quota: 2.2 }]),
    mercato("U/O corners", "corner_kicks", [{ nome: "Ov. 9.5", quota: 1.9 }]),
  ]));
  assert.equal(quotato.linee.get(chiaveDiLinea("corner_kicks", "casa"))?.length, 1);
  assert.equal(quotato.linee.get(chiaveDiLinea("corner_kicks", "trasferta"))?.length, 1);
  assert.equal(quotato.linee.get(chiaveDiLinea("corner_kicks", "totale"))?.length, 1);
});

test("le combinate e i mercati di giocatore non sono linee", () => {
  const quotato = eventoQuotato(evento([
    mercato("U/O Tiri Totali + 1X2", "total_shots", [{ nome: "Ov. 24.5", quota: 3 }]),
    mercato("1T - U/O corner", "corner_kicks", [{ nome: "Ov. 4.5", quota: 2 }]),
    mercato("Pari/dispari corner", "corner_kicks", [{ nome: "Over 9.5", quota: 2 }]),
    mercato("Tiri Totali (Emerson ())", "total_shots", [{ nome: "Ov. 1.5", quota: 2 }], "Emerson"),
  ]));
  assert.equal(quotato.linee.size, 0);
});

// Il caso che e' passato in produzione prima di essere visto: «Over 0.5» a quota 8,00 non
// e' una lettura sui cartellini della gara, e' la finestra dei primi cinque minuti.
test("le finestre di tempo non sono linee di gara", () => {
  const quotato = eventoQuotato(evento([
    mercato("5 minuti - U/O cartellini da 0:00 a 4:59", "yellow_cards", [
      { nome: "Over 0.5", quota: 8 },
    ]),
    mercato("10 minuti - U/O cartellini da 0:00 a 9:59", "yellow_cards", [
      { nome: "Over 0.5", quota: 5.25 },
      { nome: "Under 0.5", quota: 1.1 },
    ]),
    mercato("U/O Cartellini 1°Tempo", "yellow_cards", [{ nome: "Over 0.5", quota: 2.2 }]),
    mercato("U/O cartellini", "yellow_cards", [{ nome: "Over 3.5", quota: 1.375 }]),
  ]));
  assert.deepEqual(quotato.linee.get(chiaveDiLinea("yellow_cards", "totale")), [
    { soglia: 3.5, verso: "Over", quota: 1.375 },
  ]);
});

test("una quota sospesa non diventa un prezzo", () => {
  const quotato = eventoQuotato(evento([
    mercato("U/O cartellini", "yellow_cards", [
      { nome: "Ov. 3.5", quota: 0 },
      { nome: "Un. 3.5", quota: 1 },
      { nome: "Ov. 4.5", quota: 2.4 },
    ]),
    mercato("Casa multigoal", "goals", [
      { nome: "0-1", quota: 1.61 },
      { nome: "0-5", quota: 0 },
    ]),
  ]));
  assert.deepEqual(quotato.linee.get(chiaveDiLinea("yellow_cards", "totale")), [
    { soglia: 4.5, verso: "Over", quota: 2.4 },
  ]);
  assert.deepEqual(quotato.gol.multigolCasa, [{ da: 0, a: 1, quota: 1.61 }]);
});

test("i mercati sui gol escono normalizzati", () => {
  const quotato = eventoQuotato(evento([
    mercato("1x2", null, [{ nome: "1", quota: 2.75 }, { nome: "X", quota: 3.33 },
      { nome: "2", quota: 2.62 }]),
    mercato("Doppia chance", null, [{ nome: "1X", quota: 1.48 }, { nome: "12", quota: 1.35 },
      { nome: "X2", quota: 1.46 }]),
    mercato("U/O", null, [{ nome: "Un. 2.5", quota: 2.12 }, { nome: "Ov. 1.5", quota: 1.18 }]),
    mercato("Goal / Nogoal", null, [{ nome: "Goal", quota: 1.52 },
      { nome: "Nogoal", quota: 2.37 }]),
    mercato("Multigoal", null, [{ nome: "2-4", quota: 1.7 }, { nome: "0-1", quota: 4 }]),
  ]));
  assert.deepEqual(quotato.gol.esito, { uno: 2.75, x: 3.33, due: 2.62 });
  assert.deepEqual(quotato.gol.doppiaChance, { unoX: 1.48, xDue: 1.46, unoDue: 1.35 });
  assert.equal(quotato.gol.gol, 1.52);
  assert.equal(quotato.gol.noGol, 2.37);
  assert.deepEqual(quotato.gol.overUnder, [
    { soglia: 1.5, verso: "Over", quota: 1.18 },
    { soglia: 2.5, verso: "Under", quota: 2.12 },
  ]);
  assert.deepEqual(quotato.gol.multigolPartita, [
    { da: 0, a: 1, quota: 4 },
    { da: 2, a: 4, quota: 1.7 },
  ]);
});

test("le sigle non identificano una squadra", () => {
  assert.deepEqual([...paroleDiSquadra("AC Milan")], ["milan"]);
  assert.deepEqual([...paroleDiSquadra("Fenerbahçe")], ["fenerbahce"]);
});

test("l'aggancio vuole entrambi i nomi e il giorno giusto", () => {
  const palinsesto = [
    eventoQuotato({ ...evento([]), casa: "Venezia", fuori: "Fiorentina" }),
    eventoQuotato({ ...evento([]), casa: "Venezia", fuori: "Verona" }),
  ];
  assert.notEqual(
    agganciaGara("Venezia", "Fiorentina", "2026-09-11T18:45:00+00:00", palinsesto), null,
  );
  assert.equal(agganciaGara("Venezia", "Lecce", "2026-09-11T18:45:00+00:00", palinsesto), null);
  assert.equal(
    agganciaGara("Venezia", "Fiorentina", "2026-09-12T18:45:00+00:00", palinsesto), null,
  );
});

test("una gara ambigua si butta invece di prendere il prezzo sbagliato", () => {
  const palinsesto = [
    eventoQuotato({ ...evento([]), casa: "Venezia", fuori: "Fiorentina" }),
    eventoQuotato({ ...evento([]), casa: "Venezia FC", fuori: "Fiorentina Women" }),
  ];
  assert.equal(
    agganciaGara("Venezia", "Fiorentina", "2026-09-11T18:45:00+00:00", palinsesto), null,
  );
});
