// Prove del read model del capitolo «Come si affrontano»: pure, senza livello dati.
//
// Quello che verificano non e' un numero, ma le tre regole che, se saltassero, metterebbero
// in pagina una lettura falsa: il confronto incrocia davvero i due lati, una metrica che
// manca a una delle due squadre si dichiara invece di diventare zero, e la frase compare
// solo quando i due scostamenti superano il proprio errore e vanno nello stesso verso.
import assert from "node:assert/strict";
import test from "node:test";

import { comeSiAffrontano, scrivi } from "../src/server/iqstats/affronto.ts";
import type { ConMetro, MedieDiLato, VoceDiLato } from "../src/server/iqstats/lati.ts";

/** Un numero col suo metro: `errore` piccolo perche' lo scostamento si veda. */
function con(media: number, lega: number, errore: number | null = 0.1, posizione = 0.5): ConMetro {
  return { media, mediaDiLega: lega, dispersione: 5, posizione, errore };
}

function voce(chiave: string, prodotto: ConMetro, concesso: ConMetro, campione = 10): VoceDiLato {
  return { chiave, nome: chiave, prodotto, concesso, campione };
}

function lato(l: "home" | "away", voci: VoceDiLato[]): MedieDiLato {
  return { lato: l, gare: 12, squadre: 18, voci, assenti: [] };
}

test("il confronto incrocia i lati: chi produce di qua, chi concede di la'", () => {
  const casa = lato("home", [voce("precisione", con(60, 50), con(40, 50))]);
  const fuori = lato("away", [voce("precisione", con(45, 50), con(55, 50))]);
  const letture = comeSiAffrontano(casa, fuori, "Casa", "Fuori");
  const palla = letture.find((l) => l.id === "palla");
  assert.ok(palla !== undefined, "la lettura Palla non c'e'");

  const attaccaCasa = palla.direzioni.find((d) => d.id === "casa");
  assert.ok(attaccaCasa !== undefined);
  const c = attaccaCasa.confronti[0];
  assert.ok(c !== undefined);
  // Il 60 e' il prodotto della casa dal suo lato; il 55 e' il concesso della trasferta dal
  // suo. Prendere il concesso dalla stessa squadra che attacca sarebbe il difetto.
  assert.equal(c.produce.testo, "60,0%");
  assert.equal(c.concede.testo, "55,0%");

  const attaccaFuori = palla.direzioni.find((d) => d.id === "fuori");
  assert.ok(attaccaFuori !== undefined);
  assert.equal(attaccaFuori.confronti[0]?.produce.testo, "45,0%");
  assert.equal(attaccaFuori.confronti[0]?.concede.testo, "40,0%");
});

test("una metrica che manca a una sola squadra si dichiara, non diventa zero", () => {
  const casa = lato("home", [
    voce("precisione", con(60, 50), con(40, 50)),
    voce("passaggi", con(500, 420), con(380, 420)),
  ]);
  const fuori = lato("away", [voce("precisione", con(45, 50), con(55, 50))]);
  const palla = comeSiAffrontano(casa, fuori, "Casa", "Fuori").find((l) => l.id === "palla");
  assert.ok(palla !== undefined);

  const chiavi = palla.direzioni[0]?.confronti.map((c) => c.chiave) ?? [];
  assert.deepEqual(chiavi, ["precisione"], "i passaggi non devono entrare nel confronto");
  // I passaggi mancano alla trasferta, le palle lunghe a tutt'e due: si dichiarano
  // entrambe, nessuna sparisce e nessuna diventa zero.
  assert.deepEqual(palla.assenti, ["passaggi", "palle_lunghe"]);
});

test("il campione del confronto e' il piu' povero dei due", () => {
  const casa = lato("home", [voce("precisione", con(60, 50), con(40, 50), 14)]);
  const fuori = lato("away", [voce("precisione", con(45, 50), con(55, 50), 6)]);
  const palla = comeSiAffrontano(casa, fuori, "Casa", "Fuori").find((l) => l.id === "palla");
  assert.equal(palla?.direzioni[0]?.confronti[0]?.campione, 6);
});

test("la frase c'e' solo se i due scostamenti superano il loro errore e vanno insieme", () => {
  const forte = comeSiAffrontano(
    // La casa produce 60 contro 50 di metro, con errore 0,1: dieci punti, cento errori.
    lato("home", [voce("precisione", con(60, 50), con(40, 50))]),
    // La trasferta concede 55 contro 50: anche lei sopra il suo metro. Stesso verso.
    lato("away", [voce("precisione", con(45, 50), con(55, 50))]),
    "Casa", "Fuori",
  ).find((l) => l.id === "palla");
  assert.ok(forte?.sintesi !== null && forte?.sintesi !== undefined, "la frase doveva esserci");
  assert.match(forte.sintesi, /60,0%/, "la frase deve portare i numeri che la giustificano");
  assert.match(forte.sintesi, /55,0%/);
  assert.match(forte.sintesi, /sopra/);

  // La casa e' sopra il suo metro, ma chi le sta davanti e' **in linea** con il proprio: da
  // una parte sola non esce una lettura. Vale in tutt'e due le direzioni, e la prima
  // stesura di questa prova lo aveva dimenticato: la direzione opposta era concorde, e la
  // frase compariva - correttamente - da li'.
  const solaMeta = comeSiAffrontano(
    lato("home", [voce("precisione", con(60, 50), con(50, 50))]),
    lato("away", [voce("precisione", con(50, 50), con(50, 50))]),
    "Casa", "Fuori",
  ).find((l) => l.id === "palla");
  assert.equal(solaMeta?.sintesi, null, "con un solo scostamento non c'e' niente da dire");

  // **Versi opposti in tutt'e due le direzioni.** La casa ne produce piu' del suo metro ma
  // chi le sta davanti ne concede **meno** del proprio, e al contrario dall'altra parte:
  // due scostamenti veri che si contraddicono non fanno una lettura. Senza questo caso il
  // controllo del verso si poteva togliere senza che nulla arrossisse.
  const opposti = comeSiAffrontano(
    lato("home", [voce("precisione", con(60, 50), con(60, 50))]),
    lato("away", [voce("precisione", con(45, 50), con(40, 50))]),
    "Casa", "Fuori",
  ).find((l) => l.id === "palla");
  assert.equal(opposti?.sintesi, null, "versi opposti non fanno una lettura");

  const rumoroso = comeSiAffrontano(
    // Stessi scostamenti, ma errori grandi: dieci punti dentro il rumore di quindici.
    lato("home", [voce("precisione", con(60, 50, 15), con(40, 50, 15))]),
    lato("away", [voce("precisione", con(45, 50, 15), con(55, 50, 15))]),
    "Casa", "Fuori",
  ).find((l) => l.id === "palla");
  assert.equal(rumoroso?.sintesi, null, "sotto l'errore non si racconta niente");

  const senzaErrore = comeSiAffrontano(
    lato("home", [voce("precisione", con(60, 50, null), con(40, 50, null))]),
    lato("away", [voce("precisione", con(45, 50, null), con(55, 50, null))]),
    "Casa", "Fuori",
  ).find((l) => l.id === "palla");
  assert.equal(senzaErrore?.sintesi, null, "senza errore non si sa, e non si dice");
});

test("ogni scala si scrive come va letta", () => {
  // Misurato sul livello dati: possesso e precisione arrivano in centesimi, le quote della
  // shot map in frazione. Scriverle allo stesso modo direbbe 0,6% invece di 62,7%.
  assert.equal(scrivi(62.7, "percento"), "62,7%");
  assert.equal(scrivi(0.627, "frazione"), "62,7%");
  assert.equal(scrivi(17.76, "metri"), "17,8 m");
  assert.equal(scrivi(0.1112, "xg"), "0,111 xG");
  assert.equal(scrivi(417, "conteggio"), "417,0");
});

test("senza uno dei due lati non c'e' un incontro", () => {
  const casa = lato("home", [voce("precisione", con(60, 50), con(40, 50))]);
  assert.deepEqual(comeSiAffrontano(casa, null, "Casa", "Fuori"), []);
  assert.deepEqual(comeSiAffrontano(null, casa, "Casa", "Fuori"), []);
});


test("il possesso resta fuori: il concesso e' il complemento del prodotto", () => {
  // Misurato su 9.252 gare con entrambi i lati: correlazione -0,991 fra i due possessi, e
  // in 9.250 sommano a cento. Due colonne per lo stesso numero sembrerebbero due prove.
  const casa = lato("home", [
    voce("possesso", con(60, 50), con(40, 50)),
    voce("precisione", con(84, 80), con(76, 80)),
  ]);
  const fuori = lato("away", [
    voce("possesso", con(40, 50), con(60, 50)),
    voce("precisione", con(78, 80), con(83, 80)),
  ]);
  const letture = comeSiAffrontano(casa, fuori, "Casa", "Fuori");
  const chiavi = letture.flatMap((l) => l.direzioni.flatMap((d) => d.confronti.map((c) => c.chiave)));
  assert.ok(!chiavi.includes("possesso"), "il possesso non deve comparire fra i confronti");
  assert.ok(chiavi.includes("precisione"), "la precisione invece ci deve stare");
  const palla = letture.find((l) => l.id === "palla");
  assert.ok(!(palla?.assenti ?? []).includes("possesso"), "e nemmeno fra le assenti: non manca, non e' previsto");
});

test("una metrica che i due lati muovono insieme non fa la frase", () => {
  // I recuperi hanno correlazione +0,885 fra i due lati: due numeri sopra il loro metro
  // direbbero che in quella partita si recupera molto, non come si affrontano.
  const conRecuperi = comeSiAffrontano(
    lato("home", [voce("recuperi", con(50, 44), con(50, 44))]),
    lato("away", [voce("recuperi", con(50, 44), con(50, 44))]),
    "Casa", "Fuori",
  ).find((l) => l.id === "combattimento");
  assert.ok(conRecuperi !== undefined, "la lettura Combattimento deve comunque esserci");
  assert.equal(conRecuperi.direzioni[0]?.confronti[0]?.chiave, "recuperi", "il numero resta in pagina");
  assert.equal(conRecuperi.sintesi, null, "ma non diventa la frase");

  // Lo stesso scostamento su una metrica che il confronto lo regge, invece, la frase la fa.
  const conTackle = comeSiAffrontano(
    lato("home", [voce("tackle", con(50, 44), con(50, 44))]),
    lato("away", [voce("tackle", con(50, 44), con(50, 44))]),
    "Casa", "Fuori",
  ).find((l) => l.id === "combattimento");
  assert.ok(conTackle?.sintesi !== null, "sui tackle la frase deve comparire");
});
