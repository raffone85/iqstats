import assert from "node:assert/strict";
import test from "node:test";

import {
  attesiDellaGara,
  combinazione,
  distribuzioniDeiGol,
  mercatiGol,
  quotaFra,
} from "../src/server/iqstats/projection/gol.ts";

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

test("la matrice si somma sulle stesse caselle delle marginali", () => {
  const m = mercatiGol(1.51, 1.185);
  for (const linea of m.overUnder) {
    const somma = m.matrice
      .filter((cella) => cella.linea === linea.linea)
      .reduce((totale, cella) => totale + cella.congiunta, 0);
    // I tre esiti coprono tutte le caselle: la loro congiunta con la stessa linea deve
    // ricomporre esattamente la probabilita' di quella linea.
    assert.ok(Math.abs(somma - linea.sopra) < 1e-12, `linea ${linea.linea}: ${somma}`);
  }
});

test("il pareggio sopra 2,5 e il pareggio sopra 3,5 sono la stessa cosa", () => {
  const m = mercatiGol(1.51, 1.185);
  // Un pareggio ha totale pari: se supera 2,5 vale almeno 4, quindi supera anche 3,5.
  // Se questa uguaglianza si rompe, la congiunta non sta leggendo la griglia.
  const pareggio = (linea: number) =>
    m.matrice.find((cella) => cella.esito === "x" && cella.linea === linea)?.congiunta;
  assert.equal(pareggio(2.5), pareggio(3.5));
});

test("esito e linea non sono indipendenti, e la matrice lo dichiara", () => {
  const m = mercatiGol(1.51, 1.185);
  const cella = m.matrice.find((c) => c.esito === "x" && c.linea === 2.5);
  assert.ok(cella !== undefined);
  // Misurato su 11.330 gare archiviate: pareggio con oltre 2,5 gol al 6,63%, mentre il
  // prodotto delle marginali dice 13,42%. Il modello deve stare dalla parte del vero.
  assert.ok(cella.congiunta < cella.prodotto * 0.6, `${cella.congiunta} contro ${cella.prodotto}`);
  assert.ok(Math.abs(cella.congiunta - 0.0663) < 0.01, `congiunta ${cella.congiunta}`);
});

test("dove le due letture tirano nello stesso verso la congiunta supera il prodotto", () => {
  const m = mercatiGol(1.51, 1.185);
  const cella = m.matrice.find((c) => c.esito === "uno" && c.linea === 4.5);
  assert.ok(cella !== undefined);
  // Una vittoria con piu' di 4,5 gol e' piu' probabile di quanto direbbe il prodotto:
  // osservato 7,60% contro 6,13% su 11.330 gare.
  assert.ok(cella.congiunta > cella.prodotto, `${cella.congiunta} contro ${cella.prodotto}`);
});

test("una condizione sola vale quanto il mercato che la nomina", () => {
  const m = mercatiGol(1.51, 1.185);
  const uno = combinazione(1.51, 1.185, [{ tipo: "esito", quale: "uno" }]);
  assert.ok(Math.abs(uno.congiunta - m.esito.uno) < 1e-12);
  const over = combinazione(1.51, 1.185, [{ tipo: "totale", verso: "sopra", linea: 2.5 }]);
  const linea = m.overUnder.find((l) => l.linea === 2.5);
  assert.ok(Math.abs(over.congiunta - (linea?.sopra ?? 0)) < 1e-12);
  const gg = combinazione(1.51, 1.185, [{ tipo: "entrambe", segnano: true }]);
  assert.ok(Math.abs(gg.congiunta - m.gg) < 1e-12);
});

test("due condizioni incompatibili danno zero, e il prodotto no", () => {
  // Un pareggio non e' una vittoria interna: la congiunta e' zero, mentre moltiplicare
  // 44,7% per 25,4% darebbe l'11,4% di una gara che non puo' esistere.
  const esito = combinazione(1.51, 1.185, [
    { tipo: "esito", quale: "uno" },
    { tipo: "esito", quale: "x" },
  ]);
  assert.equal(esito.congiunta, 0);
  assert.ok(esito.prodotto > 0.1, `prodotto ${esito.prodotto}`);
});

test("la combinazione non e' il prodotto delle sue condizioni", () => {
  const c = combinazione(1.51, 1.185, [
    { tipo: "esito", quale: "x" },
    { tipo: "totale", verso: "sopra", linea: 2.5 },
  ]);
  // La stessa casella della matrice della voce 16: 6,61% contro il 12,9% del prodotto.
  assert.ok(Math.abs(c.congiunta - 0.0661) < 0.005, `congiunta ${c.congiunta}`);
  assert.ok(c.congiunta < c.prodotto * 0.6, `${c.congiunta} contro ${c.prodotto}`);
});

test("un risultato esatto implica il suo esito e il suo totale", () => {
  const solo = combinazione(1.51, 1.185, [{ tipo: "risultato", casa: 2, trasferta: 1 }]);
  const con = combinazione(1.51, 1.185, [
    { tipo: "risultato", casa: 2, trasferta: 1 },
    { tipo: "esito", quale: "uno" },
    { tipo: "totale", verso: "sopra", linea: 2.5 },
  ]);
  // Aggiungere condizioni gia' implicate non cambia la congiunta: se cambiasse, la griglia
  // non starebbe leggendo la stessa casella per tutte e tre.
  assert.ok(Math.abs(solo.congiunta - con.congiunta) < 1e-15);
  assert.ok(con.prodotto < con.congiunta, "il prodotto qui sottostima, e va detto");
});

test("senza condizioni non si risponde con una probabilita'", () => {
  const vuota = combinazione(1.51, 1.185, []);
  assert.equal(vuota.congiunta, 0);
  assert.equal(vuota.prodotto, 0);
});

// Le distribuzioni esposte servono a coprire le righe che il banco quota e `mercatiGol` no:
// devono essere le **stesse** probabilita', non un secondo calcolo che gli somiglia.
test("le distribuzioni esposte danno gli stessi numeri dei mercati", () => {
  const m = mercatiGol(1.62, 1.24);
  const p = distribuzioniDeiGol(1.62, 1.24);

  for (const linea of m.overUnder) {
    const sopra = quotaFra(p.totale, Math.ceil(linea.linea), p.totale.length - 1);
    assert.ok(Math.abs(sopra - linea.sopra) < 1e-12, `linea ${linea.linea}`);
  }
  for (const intervallo of m.multigolPartita) {
    const nostro = quotaFra(p.totale, intervallo.da, intervallo.a);
    assert.ok(Math.abs(nostro - intervallo.probabilita) < 1e-12, `${intervallo.da}-${intervallo.a}`);
  }
  for (const intervallo of m.casa.multigol) {
    const nostro = quotaFra(p.casa, intervallo.da, intervallo.a);
    assert.ok(Math.abs(nostro - intervallo.probabilita) < 1e-12, `casa ${intervallo.da}`);
  }
  // Un intervallo che `mercatiGol` non produce esce lo stesso, ed e' il motivo dell'aggiunta.
  assert.ok(quotaFra(p.totale, 0, 3) > 0 && quotaFra(p.totale, 0, 3) < 1);
  // La massa totale resta uno: la coda troncata e' gia' rinormalizzata a monte.
  assert.ok(Math.abs(quotaFra(p.totale, 0, p.totale.length - 1) - 1) < 1e-9);
});
