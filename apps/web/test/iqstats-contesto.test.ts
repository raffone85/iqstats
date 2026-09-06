// Prove del quadro della gara: pure, senza livello dati e senza motore.
//
// Quello che verificano non e' un testo ma le tre regole che, se saltassero, metterebbero
// in cima al dossier una lettura falsa: l'ordine delle famiglie e' quello che il prodotto
// usa gia', il metro di un atteso e' la somma dei due lati, e «piu' della media» si dice
// solo quando lo scarto supera mezza dispersione.
import assert from "node:assert/strict";
import test from "node:test";

import { contestoDiGara } from "../src/server/iqstats/contesto-gara.ts";
import type { Cappello } from "../src/server/iqstats/affronto.ts";
import type { ConMetro, MedieDiLato, VoceDiLato } from "../src/server/iqstats/lati.ts";
import type { LetturaForte, LettureDellaGara } from "../src/server/iqstats/projection/letture-forti.ts";
import type { ProiezioneDiGara } from "../src/server/iqstats/projection/match.ts";

/** Del bersaglio al quadro servono il nome e il totale atteso: il resto non lo guarda. */
function proiezione(target: string, atteso: number): ProiezioneDiGara {
  return {
    target,
    totale: { valoreAtteso: atteso, intervallo: null, linee: null, affidabilita: null, perche: "" },
  } as unknown as ProiezioneDiGara;
}

function lettura(bersaglio: string, forza: number, soglia = 7.5, prob = 0.71): LetturaForte {
  return {
    bersaglio,
    lato: "totale",
    soglia,
    verso: "Over",
    probabilita: prob,
    decisione: Math.abs(prob - 0.5),
    base: null,
    gareDiBase: null,
    squadre: [],
    affidabilita: 60,
    righeDiProva: 2000,
    sorpresa: Math.abs(prob - 0.5),
    forza,
  };
}

function forti(letture: readonly LetturaForte[]): LettureDellaGara {
  return { letture, senzaMisura: [] } as LettureDellaGara;
}

function con(media: number, lega: number, dispersione: number | null): ConMetro {
  return { media, mediaDiLega: lega, dispersione, posizione: 0.5, errore: 0.1 };
}

function voce(chiave: string, lega: number, dispersione: number | null): VoceDiLato {
  const c = con(lega, lega, dispersione);
  return { chiave, nome: chiave, prodotto: c, concesso: c, campione: 10 };
}

function lato(l: "home" | "away", voci: VoceDiLato[]): MedieDiLato {
  return { lato: l, gare: 12, squadre: 18, voci, assenti: [] };
}

const NIENTE = {
  stile: null as Cappello | null, favorito: null, gol: null, avvertenze: [],
  nomeCasa: "Casa", nomeFuori: "Fuori",
};

test("le famiglie e il loro ordine vengono da lettureForti, una per famiglia", () => {
  const c = contestoDiGara({
    ...NIENTE,
    bersagli: [
      proiezione("corner_kicks", 9.5),
      proiezione("yellow_cards", 4.7),
      proiezione("total_shots", 21.3),
      proiezione("fouls", 26.0),
    ],
    // Corner due volte: la famiglia entra una volta sola, con la sua linea piu' forte.
    forti: forti([
      lettura("corner_kicks", 0.30),
      lettura("corner_kicks", 0.20, 8.5),
      lettura("yellow_cards", 0.18, 3.5, 0.68),
      lettura("total_shots", 0.12, 20.5, 0.63),
      lettura("fouls", 0.10, 25.5, 0.6),
    ]),
    casa: null,
    fuori: null,
  });
  assert.ok(c !== null);
  assert.deepEqual(
    c.tessere.map((t) => t.bersaglio),
    ["corner_kicks", "yellow_cards", "total_shots"],
    "tre famiglie, nell'ordine di lettureForti, e i falli restano fuori",
  );
  // La percentuale della linea non sta nel quadro: la porta il pannello sotto, e qui
  // sarebbe la stessa riga scritta due volte. Il quadro aggiunge la quantita' col metro.
  assert.equal(c.tessere[0]?.atteso, "9,5");
  assert.equal(c.tessere[0]?.soggetto, "nella gara", "una linea sul totale non e' di nessuna delle due");
});

test("il metro di un atteso e' la somma delle due medie di lega dei due lati", () => {
  const c = contestoDiGara({
    ...NIENTE,
    bersagli: [proiezione("corner_kicks", 9.5)],
    forti: forti([lettura("corner_kicks", 0.3)]),
    casa: lato("home", [voce("corner", 5.2, 1.0)]),
    fuori: lato("away", [voce("corner", 4.1, 1.0)]),
  });
  // 5,2 in casa piu' 4,1 in trasferta: il totale di lega e' 9,3, non la media dei due.
  assert.equal(c?.tessere[0]?.metro, "9,3");
});

test("«più della media» si dice solo oltre mezza dispersione", () => {
  const quadro = (atteso: number, dispersione: number | null) => contestoDiGara({
    ...NIENTE,
    bersagli: [proiezione("corner_kicks", atteso)],
    forti: forti([lettura("corner_kicks", 0.3)]),
    casa: lato("home", [voce("corner", 5.0, dispersione)]),
    fuori: lato("away", [voce("corner", 4.0, dispersione)]),
  });
  // Dispersione 1,0 per lato: la somma vale radice di due, cioe' 1,41, e mezza e' 0,71.
  assert.equal(quadro(10.2, 1.0)?.tessere[0]?.verso, 1, "1,2 sopra il metro: si dice");
  assert.equal(quadro(9.5, 1.0)?.tessere[0]?.verso, 0, "mezzo sopra: dentro il rumore");
  assert.equal(quadro(7.8, 1.0)?.tessere[0]?.verso, -1, "1,2 sotto il metro: si dice");
  // Senza dispersione non si sa quanto e' tanto, e non si dichiara un verso.
  assert.equal(quadro(14.0, null)?.tessere[0]?.verso, 0);
  assert.match(quadro(10.2, 1.0)?.titolo ?? "", /^Più corner della media\.$/);
  assert.match(quadro(9.5, 1.0)?.titolo ?? "", /non si scostano dalla media/);
});

test("le avvertenze di «In breve» non si perdono", () => {
  const c = contestoDiGara({
    ...NIENTE,
    avvertenze: ["I precedenti fra queste squadre sono pochi: contano poco."],
    bersagli: [proiezione("corner_kicks", 9.5)],
    forti: forti([lettura("corner_kicks", 0.3)]),
    casa: null,
    fuori: null,
  });
  assert.match(c?.riserva ?? "", /I precedenti fra queste squadre sono pochi/);
  assert.match(c?.riserva ?? "", /mai certezze/);
});

test("chi e' avanti e il verso sui gol stanno su una riga sola", () => {
  const c = contestoDiGara({
    ...NIENTE,
    favorito: { nome: "Corinthians", probabilita: 44.4 },
    gol: "pochi gol attesi",
    bersagli: [proiezione("corner_kicks", 9.5)],
    forti: forti([lettura("corner_kicks", 0.3)]),
    casa: null,
    fuori: null,
  });
  assert.equal(c?.favorito, "Corinthians avanti al 44% · pochi gol attesi");
});

test("senza proiezione e senza stile non si inventa un quadro", () => {
  assert.equal(contestoDiGara({ ...NIENTE, bersagli: [], forti: null, casa: null, fuori: null }), null);
});

test("l'atteso e il suo metro vengono dallo stesso lato della linea", () => {
  // Difetto visto in cattura: la tessera dei tiri mostrava 25,1 - il totale della gara - e
  // sotto «under 13,5», che e' la soglia del solo Remo. Due numeri di scala diversa.
  const b = {
    target: "total_shots",
    casa: { stato: "prevista", valoreAtteso: 12.8 },
    trasferta: { stato: "prevista", valoreAtteso: 12.3 },
    totale: { valoreAtteso: 25.1, intervallo: null, linee: null, affidabilita: null, perche: "" },
  } as unknown as ProiezioneDiGara;

  const perSquadra = contestoDiGara({
    ...NIENTE,
    bersagli: [b],
    forti: forti([{ ...lettura("total_shots", 0.3, 13.5), lato: "casa" }]),
    casa: lato("home", [voce("tiri", 13.9, 2.0)]),
    fuori: lato("away", [voce("tiri", 11.2, 2.0)]),
  });
  assert.equal(perSquadra?.tessere[0]?.atteso, "12,8", "l'atteso della squadra, non della gara");
  assert.equal(perSquadra?.tessere[0]?.metro, "13,9", "e il metro del suo lato, non la somma");
  assert.equal(perSquadra?.tessere[0]?.soggetto, "Casa in casa", "e si dice di chi e', e da che lato");

  const perGara = contestoDiGara({
    ...NIENTE,
    bersagli: [b],
    forti: forti([lettura("total_shots", 0.3, 25.5)]),
    casa: lato("home", [voce("tiri", 13.9, 2.0)]),
    fuori: lato("away", [voce("tiri", 11.2, 2.0)]),
  });
  assert.equal(perGara?.tessere[0]?.atteso, "25,1");
  assert.equal(perGara?.tessere[0]?.metro, "25,1", "la somma dei due lati");
  assert.equal(perGara?.tessere[0]?.soggetto, "nella gara");
});
