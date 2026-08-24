// Lo stato di forma: quali gare entrano, quante, e contro quale metro.
//
// La funzione e' pura, quindi le righe si costruiscono a mano ed e' proprio il punto:
// cosi' si puo' fabbricare il caso che smonta ogni regola dichiarata.
import assert from "node:assert/strict";
import test from "node:test";

import { formaDi } from "../src/server/iqstats/projection/forma.ts";
import type { OsservazioneSquadraGara } from "../src/server/iqstats/projection/snapshot.ts";

type Riga = Pick<OsservazioneSquadraGara, "lato" | "quando" | "stagione" | "retiFatte" | "retiSubite">;

function riga(campi: Riga): OsservazioneSquadraGara {
  return campi as unknown as OsservazioneSquadraGara;
}

/** Gare in casa, dalla piu' vecchia alla piu' recente, con reti crescenti. */
function serie(lato: "home" | "away", quante: number, primaRete: number): OsservazioneSquadraGara[] {
  return Array.from({ length: quante }, (_, i) => riga({
    lato,
    quando: `2026-01-${String(i + 1).padStart(2, "0")}T18:00:00.000Z`,
    stagione: 1,
    retiFatte: primaRete + i,
    retiSubite: 1,
  }));
}

const LEGA = [
  ...serie("home", 4, 1),
  ...serie("away", 4, 0),
];

test("le finestre prendono le gare piu' recenti, non le prime che capitano", () => {
  // Dodici gare in casa, da 1 a 12 reti. Le ultime tre sono 10, 11, 12: media 11.
  const forma = formaDi(serie("home", 12, 1), LEGA, "home", 1);
  assert.ok(forma !== null);
  const tre = forma.finestre.find((f) => f.chieste === 3);
  assert.ok(tre !== undefined);
  assert.equal(tre.gare, 3);
  assert.equal(tre.retiFatte, 11, "ha preso le gare piu' vecchie invece delle piu' recenti");

  const dieci = forma.finestre.find((f) => f.chieste === 10);
  assert.ok(dieci !== undefined);
  // Le ultime dieci sono da 3 a 12: media 7,5.
  assert.equal(dieci.retiFatte, 7.5);
});

test("un lato non contamina l'altro", () => {
  // Sei in casa da 1 a 6, e venti in trasferta da 100 in su: se il filtro del lato
  // cadesse, la media in casa esploderebbe.
  const righe = [...serie("home", 6, 1), ...serie("away", 20, 100)];
  const forma = formaDi(righe, LEGA, "home", 1);
  assert.ok(forma !== null);
  const tre = forma.finestre.find((f) => f.chieste === 3);
  assert.ok(tre !== undefined);
  assert.equal(tre.retiFatte, 5, `le gare in trasferta sono entrate: ${tre.retiFatte}`);
});

test("una finestra piu' corta di quanto chiesto lo dichiara", () => {
  const forma = formaDi(serie("home", 4, 1), LEGA, "home", 1);
  assert.ok(forma !== null);
  const dieci = forma.finestre.find((f) => f.chieste === 10);
  assert.ok(dieci !== undefined);
  assert.equal(dieci.gare, 4, "dichiara dieci gare che non ha");
  assert.equal(dieci.retiFatte, 2.5);
});

test("senza il metro della competizione non si risponde", () => {
  // Il metro vuole lo stesso lato e la stessa stagione: qui la lega ha solo la stagione 2.
  const legaAltraStagione = serie("home", 4, 1).map((r) => ({ ...r, stagione: 2 }));
  assert.equal(formaDi(serie("home", 5, 1), legaAltraStagione, "home", 1), null);
  // E senza nemmeno una gara della squadra su quel lato.
  assert.equal(formaDi(serie("away", 5, 1), LEGA, "home", 1), null);
});

test("una gara senza reti registrate resta fuori invece di contare zero", () => {
  const righe = [
    ...serie("home", 3, 4),
    riga({ lato: "home", quando: "2026-02-01T18:00:00.000Z", stagione: 1, retiFatte: null, retiSubite: null }),
  ];
  const forma = formaDi(righe, LEGA, "home", 1);
  assert.ok(forma !== null);
  const tre = forma.finestre.find((f) => f.chieste === 3);
  assert.ok(tre !== undefined);
  assert.equal(tre.gare, 3);
  // Le tre vere sono 4, 5, 6: media 5. Contando la riga vuota come zero farebbe 3,67.
  assert.equal(tre.retiFatte, 5, `un'assenza e' diventata uno zero: ${tre.retiFatte}`);
});
