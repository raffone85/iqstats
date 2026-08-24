// Il contesto della gara: quali gare entrano, da quale lato, e quando una riga non esiste.
import assert from "node:assert/strict";
import test from "node:test";

import { contestoDellaGara } from "../src/server/iqstats/projection/contesto.ts";
import type { OsservazioneSquadraGara } from "../src/server/iqstats/projection/snapshot.ts";

const SI_GIOCA = "2026-08-24T18:00:00.000Z";

function riga(
  lato: "home" | "away",
  quando: string,
  prodotte: Record<string, number | null>,
  concesse: Record<string, number | null> = {},
): OsservazioneSquadraGara {
  return { lato, quando, stagione: 1, prodotte, concesse } as unknown as OsservazioneSquadraGara;
}

/** `quante` gare dello stesso lato, tutte con lo stesso valore, a giorni di distanza. */
function serie(
  lato: "home" | "away",
  quante: number,
  valore: number,
  metrica = "ball_possession",
  daGiorniFa = 10,
) {
  return Array.from({ length: quante }, (_, i) => {
    const data = new Date(SI_GIOCA);
    data.setUTCDate(data.getUTCDate() - (daGiorniFa + i));
    return riga(lato, data.toISOString(), { [metrica]: valore }, { [metrica]: valore });
  });
}

function possesso(famiglie: ReturnType<typeof contestoDellaGara>) {
  return famiglie
    .flatMap((f) => f.voci)
    .find((v) => v.nome === "Possesso");
}

test("le gare fuori dalla finestra di 365 giorni non entrano", () => {
  // Sei gare recenti al 60% e sei di due anni fa al 10%: se la finestra cadesse, la media
  // scenderebbe a 35.
  const vecchie = serie("home", 6, 10, "ball_possession", 700);
  const recenti = serie("home", 6, 60, "ball_possession", 10);
  const v = possesso(contestoDellaGara([...vecchie, ...recenti], [], [], SI_GIOCA));

  assert.ok(v !== undefined, "la riga non c'e'");
  assert.equal(v.casaProduce, 60, `sono entrate le gare vecchie: ${v.casaProduce}`);
  assert.equal(v.campione, 6);
});

test("il lato del campo non si mescola", () => {
  const righeCasa = [...serie("home", 5, 50), ...serie("away", 20, 90)];
  const v = possesso(contestoDellaGara(righeCasa, [], [], SI_GIOCA));

  assert.ok(v !== undefined);
  assert.equal(v.casaProduce, 50, `le gare in trasferta sono entrate: ${v.casaProduce}`);
});

test("sotto il campione minimo la metrica non si dichiara", () => {
  // Tre gare sole: una media di tre gare non e' un modo di giocare.
  const famiglie = contestoDellaGara(serie("home", 3, 55), [], [], SI_GIOCA);
  assert.equal(possesso(famiglie), undefined, "ha dichiarato una media su tre gare");
});

test("una gara senza quella colonna resta fuori invece di contare zero", () => {
  const conValore = serie("home", 4, 80);
  const senza = serie("home", 4, 0, "ball_possession", 40).map(
    (r) => riga("home", r.quando, { ball_possession: null }, { ball_possession: null }),
  );
  const v = possesso(contestoDellaGara([...conValore, ...senza], [], [], SI_GIOCA));

  assert.ok(v !== undefined);
  assert.equal(v.campione, 4, `campione ${v.campione}`);
  assert.equal(v.casaProduce, 80, `un'assenza e' diventata uno zero: ${v.casaProduce}`);
});

test("una famiglia senza nessuna metrica non compare", () => {
  // Solo possesso: «Dove arriva», «Quanto si lotta», «Da dove tira» e «Palle inattive»
  // non hanno una sola colonna, e non devono comparire vuote.
  const nomi = contestoDellaGara(serie("home", 6, 55), [], [], SI_GIOCA).map((f) => f.nome);
  assert.deepEqual(nomi, ["Come circola la palla"], `famiglie: ${nomi.join(", ")}`);
});

test("il metro della lega si legge sul lato giusto", () => {
  const casa = serie("home", 6, 60);
  const lega = [...serie("home", 8, 40), ...serie("away", 8, 90)];
  const v = possesso(contestoDellaGara(casa, [], lega, SI_GIOCA));

  assert.ok(v !== undefined);
  assert.equal(v.metroCasa, 40, `metro di casa ${v.metroCasa}`);
  assert.equal(v.metroTrasferta, 90, `metro di trasferta ${v.metroTrasferta}`);
});
