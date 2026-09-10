// Prove della classifica delle letture piu' forti. Nessuna connessione: e' aritmetica.
//
// **Il criterio e' cambiato il 6 settembre 2026** e queste prove sono state riscritte con
// lui, non cancellate. Prima l'ordine era per forza, `|probabilita - base| x affidabilita`;
// ora e' per probabilita' dentro la fascia dove la taratura tiene, perche' su 1.200 gare
// chiuse la vecchia regola portava in cima letture che rendevano 63,2% contro il 65,1%
// promesso. Quello che resta da verificare e' che la fascia sia rispettata, che l'ordine sia
// quello dichiarato, e che a parita' vinca il bersaglio che sbaglia meno.
import assert from "node:assert/strict";
import test from "node:test";

import { lettureForti } from "../src/server/iqstats/projection/letture-forti.ts";
import type { Linea, ProiezioneDiGara } from "../src/server/iqstats/projection/match.ts";

/** Cinque soglie attorno a un centro, con la probabilita' dichiarata sulla terza. */
function scala(centro: number, sopraCentrale: number): Linea[] {
  return [-2, -1, 0, 1, 2].map((passo) => {
    const soglia = centro + passo;
    // Le due estreme e le vicine restano fiacche apposta: la regola dell'accensione
    // sceglie fra le tre centrali, e vogliamo che scelga quella che dichiariamo noi.
    const sopra = passo === 0 ? sopraCentrale : passo < 0 ? 0.52 : 0.48;
    return { soglia, probabilitaSopra: sopra, probabilitaSotto: 1 - sopra };
  });
}

function bersaglio(
  target: string,
  sopraCentrale: number,
  punteggio: number | null,
): ProiezioneDiGara {
  const linee = scala(10.5, sopraCentrale);
  return {
    target,
    modelId: "prova",
    casa: { stato: "prevista", valoreAtteso: 10.5 } as ProiezioneDiGara["casa"],
    trasferta: { stato: "prevista", valoreAtteso: 10.5 } as ProiezioneDiGara["trasferta"],
    linee: { casa: linee, trasferta: null },
    totale: {
      valoreAtteso: 21,
      intervallo: null,
      linee: null,
      affidabilita: punteggio === null ? null : {
        punteggio,
        punteggioBasso: punteggio - 5,
        punteggioAlto: punteggio + 5,
        fasciaDiLettura: "prova",
        soglia: 4,
        misuratoSu: "complessivo",
        righeDiProva: 800,
      },
      perche: "prova",
    },
    scartoDiCalibrazioneDelleLinee: null,
    scartoDiCalibrazioneDelTotale: null,
    gareDiProvaDelleLinee: null,
  };
}

test("in cima sta la lettura piu' probabile, dentro la fascia che regge", () => {
  const { letture } = lettureForti([
    bersaglio("alta", 0.78, 50),
    bersaglio("bassa", 0.68, 90),
  ]);

  assert.equal(letture.length, 2);
  assert.equal(letture[0]?.bersaglio, "alta", "l'ordine dichiarato e' per probabilita'");
  assert.ok(Math.abs((letture[0]?.probabilita ?? 0) - 0.78) < 1e-9);
  // La forza resta nel contratto e continua a dire quanto la lettura si stacca dalla lega,
  // ma non decide piu' l'ordine: qui la piu' forte e' la seconda.
  assert.ok((letture[1]?.forza ?? 0) > (letture[0]?.forza ?? 0), "la forza non ordina piu'");
});

test("a parita' di probabilita' vince il bersaglio che sbaglia meno", () => {
  const { letture } = lettureForti([
    bersaglio("fragile", 0.72, 55),
    bersaglio("saldo", 0.72, 95),
  ]);
  assert.equal(letture[0]?.bersaglio, "saldo");
  assert.equal(letture[1]?.bersaglio, "fragile");
});

test("un bersaglio senza affidabilita' misurata resta fuori e viene dichiarato", () => {
  const { letture, senzaMisura } = lettureForti([
    bersaglio("misurato", 0.70, 80),
    bersaglio("senza_misura", 0.95, null),
  ]);

  assert.equal(letture.length, 1, "e' entrato un bersaglio che non sa dire quanto regge");
  assert.equal(letture[0]?.bersaglio, "misurato");
  assert.deepEqual(senzaMisura, ["senza_misura"]);
});

test("il verso e la soglia sono quelli della linea accesa, non della piu' estrema", () => {
  const { letture } = lettureForti([bersaglio("tiri", 0.30, 80)]);
  const prima = letture[0];
  assert.ok(prima !== undefined);
  // Il centro della scala e' 10,5: la regola accende la centrale, non le estreme 8,5 e 12,5.
  assert.equal(prima.soglia, 10.5, "accesa una soglia estrema invece della centrale");
  assert.equal(prima.verso, "Under", "con il 30% sopra, il verso dichiarato deve essere Under");
  assert.ok(Math.abs(prima.probabilita - 0.70) < 1e-9, "la probabilita' deve essere quella del verso");
  assert.equal(prima.lato, "casa");
});

test("sopra l'ottanta per cento una lettura non sale in cima", () => {
  // 88% su un bersaglio solido: fuori dalla fascia dove promesso e reso coincidono. Nella
  // fascia 80-90% il modello promette 81,5% e rende 74,7%, misurato su 1.200 gare chiuse.
  const { letture } = lettureForti([bersaglio("troppo_alta", 0.88, 90)]);
  assert.deepEqual(letture, [], "una lettura fuori dalla fascia tarata non e' una lettura forte");
  // Il limite e' la fascia, non la solidita': all'ottanta netto la stessa lettura entra.
  const dentro = lettureForti([bersaglio("al_limite", 0.8, 90)]);
  assert.equal(dentro.letture.length, 1);
});

test("lo stesso bersaglio non compare due volte", () => {
  // Un bersaglio solo, tre lati: casa, trasferta e totale hanno tutti una linea accesa.
  // Senza il tetto ne uscirebbero tre righe che dicono la stessa cosa da tre angoli.
  const linee = scala(10.5, 0.75);
  const tre: ProiezioneDiGara = {
    ...bersaglio("fuorigioco", 0.75, 80),
    linee: { casa: linee, trasferta: linee },
    totale: { ...bersaglio("fuorigioco", 0.75, 80).totale!, linee },
  };
  const { letture } = lettureForti([tre, bersaglio("tiri", 0.70, 80)]);

  assert.equal(letture.length, 2, "un bersaglio ha occupato piu' di una riga");
  assert.deepEqual(
    letture.map((l) => l.bersaglio), ["fuorigioco", "tiri"],
    "le righe devono essere di bersagli diversi, dal piu' forte in giu'",
  );
});

// **La soglia di scarto dalla norma, aggiunta il 10 settembre 2026.** Il criterio
// consigliava l'ovvio: su 1.200 gare chiuse lo scarto mediano della lettura in cima era
// +0,5 punti, cioe' meta' dei pronostici era la frequenza del campionato. Sotto cinque
// punti non si consiglia piu' niente, ma l'elenco resta intero: applicare la soglia anche
// alle altre letture faceva scendere la riuscita da 74,9% a 64,8%, misurato.
test("una lettura che e' la norma del campionato non diventa il consigliato", () => {
  const basi = new Map([["norma|casa|10.5|Over", { quota: 72, gare: 40 }]]);
  const { letture, consigliato } = lettureForti([bersaglio("norma", 0.75, 80)], basi);

  assert.equal(letture.length, 1, "la lettura resta nell'elenco: si toglie il consiglio, non il dato");
  assert.equal(consigliato, null, "75% su una linea che esce il 72% delle volte non e' un consiglio");
});

test("una lettura che si stacca dalla norma diventa il consigliato", () => {
  const basi = new Map([["staccata|casa|10.5|Over", { quota: 60, gare: 40 }]]);
  const { consigliato } = lettureForti([bersaglio("staccata", 0.75, 80)], basi);

  assert.equal(consigliato?.bersaglio, "staccata", "quindici punti sopra la norma vanno consigliati");
});

test("senza base di lega non si consiglia: non si sa quanto sia normale", () => {
  const { letture, consigliato } = lettureForti([bersaglio("senza_base", 0.75, 80)]);

  assert.equal(letture.length, 1);
  assert.equal(consigliato, null, "senza base lo scarto non si calcola, e un consiglio non si inventa");
});
