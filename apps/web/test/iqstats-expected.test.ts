// Il materiale di Expected: girano solo con una connessione al livello dati.
//
// Non si verifica «il numero e' questo» - cambia a ogni passata - ma che l'accostamento
// poggi su una base sola: una stagione, squadre con storia, e due squadre almeno.
import assert from "node:assert/strict";
import test from "node:test";

import { contestoExpected } from "../src/server/iqstats/expected.ts";
import { competizioniConSquadre } from "../src/server/iqstats/team-stats.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

test("l'accostamento poggia su una stagione sola, con squadre che hanno storia", opzioni, async () => {
  const competizioni = await competizioniConSquadre();
  assert.ok(competizioni.length > 0, "nessuna competizione: il livello dati non risponde?");

  const contesto = await contestoExpected(competizioni[0].sourceId);
  assert.ok(contesto !== null, `${competizioni[0].nome} non ha un contesto`);

  // Due squadre almeno: con una sola non c'e' niente da accostare, e la pagina lo dichiara.
  assert.ok(contesto.squadre.length >= 2, `solo ${contesto.squadre.length} squadre`);
  assert.ok(Number.isSafeInteger(contesto.seasonSourceId) && contesto.seasonSourceId > 0);

  for (const s of contesto.squadre) {
    assert.ok(s.gare >= 4, `${s.nome} ha ${s.gare} gare, sotto la soglia dichiarata`);
    assert.ok(s.nome.length > 0);
    // Un nome segnaposto vuol dire anagrafica non caricata: finirebbe dritto nel menu'.
    assert.ok(!s.nome.includes("segnaposto"), `${s.nome}: anagrafica non caricata`);
  }

  // Nessuna squadra ripetuta: comparirebbe due volte nello stesso menu' a tendina.
  const nomi = new Set(contesto.squadre.map((s) => s.sourceId));
  assert.equal(nomi.size, contesto.squadre.length, "una squadra compare due volte");
});

test("una competizione che non esiste non diventa un contesto vuoto", opzioni, async () => {
  assert.equal(await contestoExpected(999_999_999), null);
});
