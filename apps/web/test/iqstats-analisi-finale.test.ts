// Prove dell'analisi finale: pure, senza livello dati e senza motore.
//
// Quello che verificano non e' il testo ma le tre regole della decisione del 28 agosto 2026,
// le sole che, se saltassero, renderebbero questa sezione la scorciatoia per non guardare i
// numeri: **nessun numero** in nessuna voce, **ogni voce rimanda a un capitolo che in pagina
// esiste davvero**, e i limiti compaiono **solo** quando il difetto c'e'.
import assert from "node:assert/strict";
import test from "node:test";

import { analisiFinale } from "../src/server/iqstats/analisi-finale.ts";
import type { Cappello } from "../src/server/iqstats/affronto.ts";

/** Gli `id` delle aree montate da `capitoliDi` in `app/match/[id]/page.tsx`. */
const CAPITOLI = new Set([
  "cap-giocata", "cap-insight", "cap-mercati", "cap-gol", "cap-proiezioni", "cap-trend",
  "cap-contesto", "cap-giocatori", "cap-arbitro", "cap-precedenti",
]);

/** Del cappello all'analisi servono titolo, fase, quante prove e la coda dei muti. */
function cappello(parti: Partial<Cappello> = {}): Cappello {
  return {
    titolo: "Molto palleggio e poca presenza in area",
    parole: ["molto palleggio", "poca presenza in area"],
    fase: "quando attacca Remo",
    tratti: [{
      chiave: "tocchi_area", parola: "poca presenza in area", nome: "Tocchi in area",
      lettura: "Territorio", fase: "Remo", metro: "16,0", metroSecondo: null, campione: 19,
      verso: -1,
      punti: [{ chi: "Remo", valore: "14,2", x: 0.4 }, { chi: "Corinthians", valore: "18,4", x: 0.7 }],
    }],
    tutte: [],
    mute: null,
    nota: "Vale se le due squadre continuano così.",
    rigaBreve: null,
    ...parti,
  };
}

/** L'analisi piena, quella di una gara che ha tutto e dichiara tutti i suoi limiti. */
function piena() {
  return analisiFinale({
    favorito: "Corinthians",
    famiglieForti: ["corner", "fuorigioco"],
    cappello: cappello({ mute: "Palla: nessuna differenza che regge il rumore." }),
    arbitroGiudizio: "severo",
    senzaArbitro: false,
    senzaMisura: ["parate"],
    senzaGol: true,
    senzaProiezione: false,
  });
}

test("nessuna voce porta un numero: i numeri stanno nei capitoli, non qui", () => {
  const analisi = piena();
  assert.ok(analisi !== null);
  for (const voce of [...analisi.dice, ...analisi.limiti]) {
    assert.doesNotMatch(voce.testo, /\d/, `«${voce.testo}» porta una cifra`);
  }
  assert.doesNotMatch(analisi.nota, /\d/);
});

test("ogni voce rimanda a un capitolo che in pagina esiste davvero", () => {
  const analisi = piena();
  assert.ok(analisi !== null);
  const voci = [...analisi.dice, ...analisi.limiti];
  assert.ok(voci.length >= 6, `voci trovate ${voci.length}`);
  for (const voce of voci) {
    assert.ok(CAPITOLI.has(voce.ancora), `ancora sconosciuta: ${voce.ancora}`);
    assert.ok(voce.capitolo.length > 0, "voce senza nome di capitolo");
  }
});

test("favorito e scostamento stanno in una frase sola, non in due voci", () => {
  // «sui parate» e' l'errore che questa prova impedisce: le sette famiglie non hanno tutte
  // lo stesso genere, quindi la preposizione resta nuda.
  const analisi = piena();
  assert.ok(analisi !== null);
  const colpo = analisi.dice.filter((v) => v.ancora === "cap-insight");
  assert.equal(colpo.length, 1);
  assert.match(colpo[0].testo, /Corinthians/);
  assert.match(colpo[0].testo, /su corner e fuorigioco/);
});

test("un limite compare solo quando quel difetto c'e'", () => {
  const senzaDifetti = analisiFinale({
    favorito: "Corinthians",
    famiglieForti: ["corner"],
    cappello: cappello(),
    arbitroGiudizio: "in linea",
    senzaArbitro: false,
    senzaMisura: [],
    senzaGol: false,
    senzaProiezione: false,
  });
  assert.ok(senzaDifetti !== null);
  assert.equal(senzaDifetti.limiti.length, 0);
  assert.equal(senzaDifetti.dice.length, 3);
});

test("l'arbitro entra fra i limiti quando manca, e fra le letture quando c'e'", () => {
  const vuoto = {
    favorito: null, famiglieForti: [], cappello: null,
    senzaMisura: [], senzaGol: false, senzaProiezione: false,
  };
  const manca = analisiFinale({ ...vuoto, arbitroGiudizio: null, senzaArbitro: true });
  assert.equal(manca?.dice.length, 0);
  assert.equal(manca?.limiti.length, 1);
  assert.equal(manca?.limiti[0].ancora, "cap-arbitro");

  const ce = analisiFinale({ ...vuoto, arbitroGiudizio: "permissivo", senzaArbitro: false });
  assert.equal(ce?.limiti.length, 0);
  assert.match(ce?.dice[0].testo ?? "", /permissivo/);
});

test("senza niente da dire e senza limiti la sezione non esiste", () => {
  const niente = analisiFinale({
    favorito: null, famiglieForti: [], cappello: null, arbitroGiudizio: null,
    senzaArbitro: false, senzaMisura: [], senzaGol: false, senzaProiezione: false,
  });
  assert.equal(niente, null);
});
