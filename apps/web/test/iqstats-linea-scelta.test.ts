import assert from "node:assert/strict";
import test from "node:test";

import {
  daAccendere,
  decisione,
  soglieReali,
  type LineaProbabile,
} from "../src/server/iqstats/projection/linea-scelta.ts";

/** Una linea dalla sola probabilità di stare sopra: il sotto è il complemento. */
function linea(soglia: number, sopra: number): LineaProbabile {
  return { soglia, probabilitaSopra: sopra, probabilitaSotto: 1 - sopra };
}

/**
 * Il caso che ha fatto nascere la regola: Grêmio fuori casa nei tiri, 23 agosto 2026.
 * Atteso 9,3. Prima, la pagina accendeva la terza soglia per posizione — 8,5 al 54% —
 * che è quasi una moneta, e la faceva sembrare un consiglio.
 */
const GREMIO_TIRI = [
  linea(6.5, 0.75),
  linea(7.5, 0.65),
  linea(8.5, 0.54),
  linea(9.5, 0.44),
  linea(10.5, 0.35),
];

test("la decisione misura la distanza da una moneta", () => {
  assert.ok(Math.abs(decisione(linea(9.5, 0.5))) < 1e-12, "cinquanta è una moneta");
  assert.ok(decisione(linea(6.5, 0.75)) > decisione(linea(8.5, 0.54)));
  // Il verso non conta: 25% e 75% sono decisi allo stesso modo, in direzioni opposte.
  assert.ok(Math.abs(decisione(linea(1, 0.25)) - decisione(linea(1, 0.75))) < 1e-12);
});

test("Grêmio: si accende la più decisa fra le vicine, non la più ovvia", () => {
  const scelta = daAccendere(GREMIO_TIRI);
  assert.equal(GREMIO_TIRI[scelta.prima].soglia, 7.5, "attesa la soglia 7,5, Over 65%");
  // Le due estreme non si accendono mai, nemmeno quella al 75%.
  assert.notEqual(scelta.prima, 0, "6,5 al 75% è ovvia, non robusta");
  assert.notEqual(scelta.prima, GREMIO_TIRI.length - 1);
  // E non si accende più la terza per posizione, che era il difetto di partenza.
  assert.notEqual(GREMIO_TIRI[scelta.prima].soglia, 8.5, "8,5 al 54% è quasi una moneta");
});

test("due letture a meno di tre punti si accendono entrambe", () => {
  // 7,5 al 58% e 9,5 al 57%: un punto di differenza, il modello non le distingue.
  const vicine = [linea(6.5, 0.8), linea(7.5, 0.58), linea(8.5, 0.52), linea(9.5, 0.43), linea(10.5, 0.2)];
  const scelta = daAccendere(vicine);
  assert.equal(vicine[scelta.prima].soglia, 7.5);
  assert.ok(scelta.seconda !== null, "una lettura a un punto di distanza va accesa anche lei");
  assert.equal(vicine[scelta.seconda].soglia, 9.5);
});

test("una lettura sola resta sola quando le altre sono lontane", () => {
  const nette = [linea(6.5, 0.9), linea(7.5, 0.72), linea(8.5, 0.51), linea(9.5, 0.49), linea(10.5, 0.1)];
  const scelta = daAccendere(nette);
  assert.equal(nette[scelta.prima].soglia, 7.5, "72% stacca tutte le altre vicine");
  assert.equal(scelta.seconda, null, "nessuna le sta a meno di tre punti");
});

test("con meno di tre soglie non si accende niente", () => {
  assert.deepEqual(daAccendere([]), { prima: -1, seconda: null });
  assert.deepEqual(daAccendere([linea(1.5, 0.6)]), { prima: -1, seconda: null });
  assert.deepEqual(daAccendere([linea(1.5, 0.6), linea(2.5, 0.4)]), { prima: -1, seconda: null });
});

test("con tre soglie si guarda solo quella di mezzo, e le estreme restano spente", () => {
  const tre = [linea(6.5, 0.95), linea(7.5, 0.55), linea(8.5, 0.05)];
  const scelta = daAccendere(tre);
  assert.equal(tre[scelta.prima].soglia, 7.5, "le estreme non si accendono nemmeno al 95%");
  assert.equal(scelta.seconda, null);
});

test("quando tutte le vicine sono monete, si accende comunque la meno moneta", () => {
  // Nessuna lettura forte: la regola non deve rompersi, e la pagina dirà a parole che
  // la lettura resta aperta.
  const piatte = [linea(6.5, 0.7), linea(7.5, 0.51), linea(8.5, 0.5), linea(9.5, 0.49), linea(10.5, 0.3)];
  const scelta = daAccendere(piatte);
  assert.ok(scelta.prima >= 1 && scelta.prima <= 3, "sempre fra le tre centrali");
  assert.equal(piatte[scelta.prima].soglia, 7.5);
});

/**
 * Il caso vero: fuorigioco di Red Bull Bragantino sul dossier 7231, 23 agosto 2026, atteso
 * 1,0. Il motore costruisce `-1,5 -0,5 0,5 1,5 2,5`: due soglie che un conteggio non può
 * scendere a superare, e che entravano fra le tre centrali confrontate dalla regola.
 */
const FUORIGIOCO_BRAGANTINO = [
  linea(-1.5, 1),
  linea(-0.5, 1),
  linea(0.5, 0.63),
  linea(1.5, 0.26),
  linea(2.5, 0.08),
];

test("le soglie sotto zero non arrivano in pagina", () => {
  const scala = soglieReali(FUORIGIOCO_BRAGANTINO);
  assert.deepEqual(scala.map((l) => l.soglia), [0.5, 1.5, 2.5], "restano le tre vere");
  assert.equal(soglieReali([]).length, 0, "un elenco vuoto resta vuoto");
  assert.deepEqual(
    soglieReali([linea(6.5, 0.75), linea(7.5, 0.65)]).map((l) => l.soglia),
    [6.5, 7.5],
    "dove nessuna soglia è negativa non si toglie niente",
  );
});

test("senza il filtro la regola accenderebbe una soglia impossibile", () => {
  // Con le cinque grezze, le tre centrali sono -0,5 · 0,5 · 1,5, e la più decisa è -0,5
  // al 100%: una casella accesa su un evento certo, che non è una lettura.
  const grezza = daAccendere(FUORIGIOCO_BRAGANTINO);
  assert.equal(FUORIGIOCO_BRAGANTINO[grezza.prima].soglia, -0.5, "il difetto, se non si filtra");

  // Filtrata, le centrali sono la sola 1,5, e la regola accende quella.
  const scala = soglieReali(FUORIGIOCO_BRAGANTINO);
  const scelta = daAccendere(scala);
  assert.equal(scala[scelta.prima].soglia, 1.5, "resta la sola soglia vera fra le estreme");
  assert.equal(scelta.seconda, null);
});
