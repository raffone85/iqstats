import assert from "node:assert/strict";
import test from "node:test";

import { attesiDellaGara, mercatiGol } from "../src/server/iqstats/projection/gol.ts";

/** Le probabilita' sono numeri fra zero e uno: nessun mercato puo' uscirne. */
function fraZeroEUno(valore: number, dove: string) {
  assert.ok(valore >= 0 && valore <= 1, `${dove} fuori scala: ${valore}`);
}

test("la griglia e' una distribuzione: i tre esiti sommano a uno", () => {
  const m = mercatiGol(2.54, 0.98);
  assert.ok(Math.abs(m.esito.uno + m.esito.x + m.esito.due - 1) < 1e-9);
  assert.ok(Math.abs(m.gg + m.ng - 1) < 1e-12);
  for (const linea of m.overUnder) {
    assert.ok(Math.abs(linea.sopra + linea.sotto - 1) < 1e-12, `linea ${linea.linea}`);
  }
});

test("i gol attesi tornano indietro dalla distribuzione", () => {
  const m = mercatiGol(2.54, 0.98);
  // La media di una Poisson e' il suo parametro: se la griglia fosse troncata troppo
  // presto, o la ricorrenza sbagliata, questo scarto crescerebbe.
  assert.ok(Math.abs(m.casa.attesi - 2.54) < 1e-6, `casa: ${m.casa.attesi}`);
  assert.ok(Math.abs(m.trasferta.attesi - 0.98) < 1e-6, `trasferta: ${m.trasferta.attesi}`);
  assert.equal(m.attesiTotali, 2.54 + 0.98);
});

test("la squadra piu' forte e' favorita, e le linee scendono al salire della soglia", () => {
  const m = mercatiGol(2.54, 0.98);
  assert.ok(m.esito.uno > m.esito.due, "chi ha piu' gol attesi deve essere favorito");
  assert.ok(m.esito.uno > m.esito.x);
  for (let i = 1; i < m.overUnder.length; i += 1) {
    assert.ok(
      m.overUnder[i].sopra < m.overUnder[i - 1].sopra,
      `Over ${m.overUnder[i].linea} non puo' battere Over ${m.overUnder[i - 1].linea}`,
    );
  }
});

test("l'intervallo centrale racconta dove si concentra la meta' dei casi", () => {
  const forte = mercatiGol(2.54, 0.98);
  assert.deepEqual(
    [forte.casa.minimo, forte.casa.massimo], [1, 3],
    "con 2,54 gol attesi la meta' centrale sta fra 1 e 3",
  );
  assert.deepEqual([forte.trasferta.minimo, forte.trasferta.massimo], [0, 1]);
  // Piu' gol attesi, intervallo piu' in alto: se il criterio fosse un indice fisso questo
  // confronto non si muoverebbe.
  const dilagante = mercatiGol(4.2, 0.5);
  assert.ok(dilagante.casa.minimo > forte.casa.minimo);
});

test("i risultati piu' probabili sono ordinati e coerenti con il favorito", () => {
  const m = mercatiGol(2.54, 0.98);
  assert.equal(m.risultati.length, 5);
  for (let i = 1; i < m.risultati.length; i += 1) {
    assert.ok(m.risultati[i].probabilita <= m.risultati[i - 1].probabilita);
  }
  const primo = m.risultati[0];
  assert.ok(primo.casa > primo.trasferta, "il primo risultato deve dare avanti il favorito");
});

test("nessun mercato esce dalla scala", () => {
  const m = mercatiGol(1.7, 1.3);
  fraZeroEUno(m.gg, "gg");
  fraZeroEUno(m.doppiaChance.unoX, "1X");
  fraZeroEUno(m.doppiaChance.xDue, "X2");
  fraZeroEUno(m.doppiaChance.unoDue, "12");
  for (const intervallo of m.multigolPartita) {
    fraZeroEUno(intervallo.probabilita, `multigol ${intervallo.da}-${intervallo.a}`);
  }
  for (const intervallo of m.casa.multigol) {
    fraZeroEUno(intervallo.probabilita, `multigol casa ${intervallo.da}-${intervallo.a}`);
  }
  for (const esatto of m.casa.esatti) fraZeroEUno(esatto, "gol esatti casa");
  // Le tre doppie chance coprono ogni esito due volte: la loro somma vale due.
  const somma = m.doppiaChance.unoX + m.doppiaChance.xDue + m.doppiaChance.unoDue;
  assert.ok(Math.abs(somma - 2) < 1e-9, `somma delle doppie chance: ${somma}`);
});

test("un pareggio simmetrico resta simmetrico", () => {
  const m = mercatiGol(1.4, 1.4);
  assert.ok(Math.abs(m.esito.uno - m.esito.due) < 1e-12, "nessun lato puo' essere favorito");
  assert.deepEqual(m.casa.esatti, m.trasferta.esatti);
});

test("attesiDellaGara pesa attacco e difesa contro il metro di lega", () => {
  // Con un campione lungo l'ancoraggio pesa poco e il conto e' quello classico.
  const lungo = { campione: 200 };
  const media = attesiDellaGara({
    attaccoCasa: { media: 1.5, ...lungo }, difesaCasa: { media: 1.1, ...lungo },
    attaccoTrasferta: { media: 1.1, ...lungo }, difesaTrasferta: { media: 1.5, ...lungo },
    legaCasa: 1.5, legaTrasferta: 1.1,
  });
  assert.ok(media !== null);
  // Due squadre esattamente nella media: il conto deve restituire il metro, intatto.
  assert.ok(Math.abs(media.casa - 1.5) < 1e-9, `casa: ${media.casa}`);
  assert.ok(Math.abs(media.trasferta - 1.1) < 1e-9, `trasferta: ${media.trasferta}`);
  // Il vantaggio del campo non e' un coefficiente aggiunto: sta nei due metri diversi.
  assert.ok(media.casa > media.trasferta);

  const forte = attesiDellaGara({
    attaccoCasa: { media: 3.0, ...lungo }, difesaCasa: { media: 1.1, ...lungo },
    attaccoTrasferta: { media: 1.1, ...lungo }, difesaTrasferta: { media: 1.5, ...lungo },
    legaCasa: 1.5, legaTrasferta: 1.1,
  });
  assert.ok(forte !== null);
  assert.ok(forte.casa > media.casa, "un attacco sopra la media deve alzare i gol attesi");
});

test("una gara sola non diventa una stagione: il caso Go Ahead Eagles", () => {
  // Il 23 agosto 2026, con una gara per lato, il conto senza ancoraggio dava 4,55 gol
  // attesi alla squadra di casa, vittoria al 95% e Over 4,5 al 59%. Questo test esiste
  // perche' quel numero non torni.
  const unaSola = attesiDellaGara({
    attaccoCasa: { media: 3.0, campione: 1 }, difesaCasa: { media: 1.5, campione: 1 },
    attaccoTrasferta: { media: 0.4, campione: 1 }, difesaTrasferta: { media: 3.0, campione: 1 },
    legaCasa: 1.5, legaTrasferta: 1.2,
  });
  assert.ok(unaSola !== null);
  assert.ok(
    unaSola.casa < 2.6,
    `con una gara sola i gol attesi non possono arrivare a ${unaSola.casa}`,
  );
  const mercati = mercatiGol(unaSola.casa, unaSola.trasferta);
  assert.ok(
    mercati.esito.uno < 0.75,
    `con una gara sola la vittoria non puo' stare al ${Math.round(mercati.esito.uno * 100)}%`,
  );

  // Lo stesso rendimento, ma tenuto per venti gare, deve invece contare davvero.
  const venti = attesiDellaGara({
    attaccoCasa: { media: 3.0, campione: 20 }, difesaCasa: { media: 1.5, campione: 20 },
    attaccoTrasferta: { media: 0.4, campione: 20 }, difesaTrasferta: { media: 3.0, campione: 20 },
    legaCasa: 1.5, legaTrasferta: 1.2,
  });
  assert.ok(venti !== null);
  assert.ok(venti.casa > unaSola.casa, "piu' campione, piu' la squadra pesa sul suo numero");
});

test("senza un metro di lega non si inventa un numero", () => {
  const uno = { campione: 10 };
  const forze = {
    attaccoCasa: { media: 1.5, ...uno }, difesaCasa: { media: 1.1, ...uno },
    attaccoTrasferta: { media: 1.1, ...uno }, difesaTrasferta: { media: 1.5, ...uno },
  };
  assert.equal(attesiDellaGara({ ...forze, legaCasa: 0, legaTrasferta: 1.1 }), null);
  assert.equal(attesiDellaGara({ ...forze, legaCasa: 1.5, legaTrasferta: 0 }), null);
  assert.equal(attesiDellaGara({ ...forze, legaCasa: NaN, legaTrasferta: 1.1 }), null);
});
