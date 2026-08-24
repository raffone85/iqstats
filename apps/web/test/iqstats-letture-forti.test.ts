// Prove della classifica delle letture piu' forti. Nessuna connessione: e' aritmetica.
//
// Quello che verificano e' l'unica cosa che rende questa sezione diversa da un elenco
// ordinato per percentuale: **una lettura piu' probabile puo' finire sotto una meno
// probabile**, quando il bersaglio da cui viene sbaglia di piu' fuori campione. Se questa
// prova passasse anche ordinando per probabilita', la sezione non varrebbe niente.
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
  };
}

test("una lettura piu' probabile finisce sotto una meno probabile se regge di meno", () => {
  // Rumoroso: 78% ma il bersaglio ci prende il 50% delle volte -> forza 0,28 x 0,50 = 0,140
  // Solido:   68% ma il bersaglio ci prende il 90% delle volte -> forza 0,18 x 0,90 = 0,162
  const { letture } = lettureForti([
    bersaglio("rumoroso", 0.78, 50),
    bersaglio("solido", 0.68, 90),
  ]);

  assert.equal(letture.length, 2);
  assert.equal(
    letture[0]?.bersaglio, "solido",
    "in cima deve stare la lettura che regge, non quella con la percentuale piu' alta",
  );
  assert.ok(Math.abs((letture[0]?.forza ?? 0) - 0.162) < 1e-9, `forza ${letture[0]?.forza}`);
  assert.ok(Math.abs((letture[1]?.forza ?? 0) - 0.14) < 1e-9, `forza ${letture[1]?.forza}`);
  // La probabilita' resta quella vera: si riordina la lettura, non si ritocca il numero.
  assert.ok(Math.abs((letture[1]?.probabilita ?? 0) - 0.78) < 1e-9);
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

test("sotto la forza minima non si dichiara niente", () => {
  // 53% su un bersaglio all'80%: forza 0,03 x 0,80 = 0,024, sotto lo 0,05 richiesto.
  const { letture } = lettureForti([bersaglio("fiacco", 0.53, 80)]);
  assert.deepEqual(letture, [], "una lettura quasi a moneta non e' una lettura forte");
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
