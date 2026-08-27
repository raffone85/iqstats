// **La priorita' fra le fonti dell'allenatore e' una decisione, quindi va difesa da un test.**
//
// Tre cose possono romperla in silenzio, e nessuna farebbe fallire il build:
//
// 1. l'ordine si inverte e il nostro livello dati scavalca la fonte: l'allenatore tornerebbe
//    quello dell'ultima gara giocata anche dove la fonte sa che e' cambiato — misurato il
//    27 agosto 2026, succede nel 4,1% dei casi in cui parlano entrambe;
// 2. il taglio dei 45 giorni sparisce: rientrerebbero le osservazioni vecchie, dove
//    l'allenatore e' cambiato fra il 10,7% e il 29,8% delle volte;
// 3. il ripiego smette di distinguere «troppo vecchio» da «non c'e'», e la pagina perde
//    l'unica riga che permette a chi legge di accorgersene.
import assert from "node:assert/strict";
import test from "node:test";

import {
  allenatoreDellaSquadra,
  GIORNI_MASSIMI,
  provenienzaInChiaro,
  type FontiAllenatore,
} from "../src/server/iqstats/allenatore.ts";
import type { ManagerInfo } from "../src/server/iqstats/match-context.ts";

/** Un profilo qualunque: qui conta l'identificativo, non che cosa la fonte racconti. */
function profiloFinto(id: number): ManagerInfo {
  return {
    id,
    name: `Allenatore ${id}`,
    country: null,
    tacticalProfile: null,
    preferredFormation: null,
    matches: null,
    wins: null,
    draws: null,
    losses: null,
    avgGoalsScored: null,
    avgGoalsConceded: null,
    avgPossession: null,
    cleanSheetPct: null,
    bttsPct: null,
    over25Pct: null,
    updatedAt: null,
  };
}

function fonti(opzioni: {
  prossimaGara?: number | null;
  ultimaOsservata?: { id: number; quando: string; giorni: number } | null;
}): FontiAllenatore {
  return {
    profilo: async (id) => profiloFinto(id),
    prossimaGara: async () => opzioni.prossimaGara ?? null,
    ultimaOsservata: async () => opzioni.ultimaOsservata ?? null,
  };
}

const IERI = { id: 300, quando: "2026-08-26T18:45:00+00:00", giorni: 1 };

test("l'evento vince su tutto: e' l'allenatore di questa gara", async () => {
  const scelto = await allenatoreDellaSquadra(
    59,
    100,
    fonti({ prossimaGara: 200, ultimaOsservata: IERI }),
  );
  assert.equal(scelto.esito, "trovato");
  assert.equal(scelto.esito === "trovato" ? scelto.id : null, 100);
  assert.equal(scelto.esito === "trovato" ? scelto.fonte : null, "evento");
});

test("senza evento vince la fonte, non la nostra ultima gara osservata", async () => {
  const scelto = await allenatoreDellaSquadra(
    59,
    null,
    fonti({ prossimaGara: 200, ultimaOsservata: IERI }),
  );
  assert.equal(scelto.esito === "trovato" ? scelto.id : null, 200);
  assert.equal(scelto.esito === "trovato" ? scelto.fonte : null, "prossima-gara");
});

test("quando la fonte tace entra l'ultima gara osservata, se e' recente", async () => {
  const scelto = await allenatoreDellaSquadra(
    59,
    null,
    fonti({ prossimaGara: null, ultimaOsservata: IERI }),
  );
  assert.equal(scelto.esito === "trovato" ? scelto.id : null, 300);
  assert.equal(scelto.esito === "trovato" ? scelto.fonte : null, "ultima-osservata");
});

test(`l'ultima gara osservata vale fino a ${GIORNI_MASSIMI} giorni compresi`, async () => {
  const dentro = await allenatoreDellaSquadra(
    59,
    null,
    fonti({ ultimaOsservata: { ...IERI, giorni: GIORNI_MASSIMI } }),
  );
  assert.equal(dentro.esito, "trovato");

  const fuori = await allenatoreDellaSquadra(
    59,
    null,
    fonti({ ultimaOsservata: { ...IERI, giorni: GIORNI_MASSIMI + 1 } }),
  );
  assert.equal(fuori.esito, "scaduto", "oltre il taglio l'osservazione non nomina piu' nessuno");
  assert.equal(fuori.esito === "scaduto" ? fuori.giorni : null, GIORNI_MASSIMI + 1);
});

test("scaduto non e' assente, e la pagina puo' dire la differenza", async () => {
  const scaduto = await allenatoreDellaSquadra(
    59,
    null,
    fonti({ ultimaOsservata: { ...IERI, giorni: 102 } }),
  );
  const assente = await allenatoreDellaSquadra(59, null, fonti({}));
  assert.equal(assente.esito, "assente");
  assert.notEqual(provenienzaInChiaro(scaduto), provenienzaInChiaro(assente));
  assert.match(provenienzaInChiaro(scaduto), /102 giorni fa/);
  assert.match(provenienzaInChiaro(assente), /non dichiarato/);
});

test("senza identificativo di squadra non si inventa niente", async () => {
  const scelto = await allenatoreDellaSquadra(null, null, fonti({ prossimaGara: 200 }));
  assert.equal(scelto.esito, "assente");
});
