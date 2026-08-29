// Prove del read model del capitolo «Come si affrontano»: pure, senza livello dati.
//
// Quello che verificano non e' un numero, ma le tre regole che, se saltassero, metterebbero
// in pagina una lettura falsa: il confronto incrocia davvero i due lati, una metrica che
// manca a una delle due squadre si dichiara invece di diventare zero, e la frase compare
// solo quando i due scostamenti superano il proprio errore e vanno nello stesso verso.
import assert from "node:assert/strict";
import test from "node:test";

import { cappelloDi, comeSiAffrontano, scrivi } from "../src/server/iqstats/affronto.ts";
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


/** Una lettura che separa le squadre in **una** direzione sola: l'altra resta in linea. */
function separaInCasa(chiave: string, alto: number, metro: number): [VoceDiLato, VoceDiLato] {
  return [
    voce(chiave, con(alto, metro), con(metro, metro)),
    voce(chiave, con(metro, metro), con(alto - 1, metro)),
  ];
}

test("senza confronti che reggono, il cappello lo dice invece di tacere", () => {
  const c = cappelloDi(comeSiAffrontano(
    lato("home", [voce("precisione", con(80, 80), con(80, 80))]),
    lato("away", [voce("precisione", con(80, 80), con(80, 80))]),
    "Casa", "Fuori",
  ));
  assert.ok(c !== null);
  assert.match(c.titolo, /troppo vicini/);
  assert.deepEqual(c.tratti, []);
  assert.match(c.nota, /dentro il rumore/);
  assert.equal(c.rigaBreve, null, "in cima al dossier non si manda una riga vuota");
});

test("il titolo traduce il verso in parole, e le parole vengono dalla tabella", () => {
  const [giu, giuF] = separaInCasa("passaggi", 300, 420);
  const sotto = cappelloDi(comeSiAffrontano(
    lato("home", [giu]), lato("away", [giuF]), "Casa", "Fuori",
  ));
  assert.equal(sotto?.titolo, "Poco palleggio");
  assert.equal(sotto?.fase, "quando attacca Casa");

  const [su, suF] = separaInCasa("passaggi", 540, 420);
  const sopra = cappelloDi(comeSiAffrontano(
    lato("home", [su]), lato("away", [suF]), "Casa", "Fuori",
  ));
  assert.equal(sopra?.titolo, "Molto palleggio");
});

test("ogni prova porta i suoi due numeri, il metro e il campione", () => {
  const [pc, pf] = separaInCasa("precisione", 84, 80);
  const c = cappelloDi(comeSiAffrontano(
    lato("home", [pc, voce("quota_area", con(0.6, 0.6), con(0.6, 0.6))]),
    lato("away", [pf, voce("quota_area", con(0.6, 0.6), con(0.6, 0.6))]),
    "Casa", "Fuori",
  ));
  assert.ok(c !== null);
  const t = c.tratti[0];
  assert.ok(t !== undefined);
  assert.equal(t.punti[0].chi, "Casa");
  assert.equal(t.punti[0].valore, "84,0%");
  assert.equal(t.punti[1].chi, "avversari di Fuori");
  assert.equal(t.punti[1].valore, "83,0%");
  assert.equal(t.metro, "80,0%");
  assert.equal(t.campione, 10);
  assert.equal(c.mute, "Tiro: nessuna differenza che regga il rumore.");
  // La riserva resta in pagina: non e' una previsione del risultato.
  assert.match(c.nota, /del risultato non parla/);
});

test("i due punti cadono dalla stessa parte del centro, ed e' il colpo d'occhio", () => {
  // **E' l'invariante di tutto il disegno.** Il tratto si vede prima di leggerlo solo se i
  // due punti stanno dalla stessa parte della media di lega: se uno passa dall'altra, la
  // riga direbbe con la grafica il contrario di quello che dice col titolo.
  for (const [alto, metro] of [[90, 80], [300, 420]] as const) {
    const [a, b] = separaInCasa("passaggi", alto, metro);
    const c = cappelloDi(comeSiAffrontano(lato("home", [a]), lato("away", [b]), "Casa", "Fuori"));
    const t = c?.tratti[0];
    assert.ok(t !== undefined);
    const scarti = t.punti.map((p) => p.x - 50);
    assert.ok(
      Math.sign(scarti[0] ?? 0) === Math.sign(scarti[1] ?? 0) && scarti[0] !== 0,
      `i punti cadono da parti opposte del centro: ${t.punti[0].x} e ${t.punti[1].x}`,
    );
    assert.equal(Math.sign(scarti[0] ?? 0), t.verso, "e dalla parte che il verso dichiara");
    for (const punto of t.punti) {
      assert.ok(punto.x >= 4 && punto.x <= 96, `punto fuori dall'asse: ${punto.x}`);
    }
  }
});

test("da che parte pende si dice solo se le prove guardano la stessa fase", () => {
  const [pc, pf] = separaInCasa("precisione", 84, 80);
  const [uc, uf] = separaInCasa("ultimo_terzo", 60, 50);
  const unaFase = cappelloDi(comeSiAffrontano(
    lato("home", [pc, uc]), lato("away", [pf, uf]), "Casa", "Fuori",
  ));
  assert.equal(unaFase?.fase, "quando attacca Casa");

  // Il tackle si fa senza palla: descrive l'attacco di Fuori, non di Casa. Due fasi
  // diverse, quindi non se ne dichiara nessuna.
  const [tc, tf] = separaInCasa("tackle", 20, 15);
  const dueFasi = cappelloDi(comeSiAffrontano(
    lato("home", [pc, tc]), lato("away", [pf, tf]), "Casa", "Fuori",
  ));
  assert.equal(dueFasi?.fase, null);
});

test("la fase la decide la metrica, non chi produce il numero", () => {
  const [ic, if_] = separaInCasa("intercetti", 12, 8);
  const c = cappelloDi(comeSiAffrontano(
    lato("home", [ic]), lato("away", [if_]), "Casa", "Fuori",
  ));
  assert.equal(c?.fase, "quando attacca Fuori");
  assert.equal(c?.tratti[0]?.punti[0].chi, "Casa");
  assert.equal(c?.tratti[0]?.punti[1].chi, "avversari di Fuori");

  // Un duello lo giocano in due: senza una fase vera non se ne dichiara una falsa.
  const [dc, df] = separaInCasa("duelli", 60, 49);
  const senzaFase = cappelloDi(comeSiAffrontano(
    lato("home", [dc]), lato("away", [df]), "Casa", "Fuori",
  ));
  assert.equal(senzaFase?.fase, null);
});

test("i confronti in elenco sono al massimo quattro, e i tagliati si dichiarano", () => {
  // Misurato su 80 gare: la mediana ne ha due che reggono, il 75° percentile quattro, il
  // 90° sette. Quattro copre la mediana con margine; oltre torna a essere un elenco.
  const coppie = [
    separaInCasa("precisione", 90, 80),
    separaInCasa("passaggi", 520, 420),
    separaInCasa("palle_lunghe", 70, 52),
    separaInCasa("tackle", 20, 15),
    separaInCasa("intercetti", 12, 8),
  ];
  const c = cappelloDi(comeSiAffrontano(
    lato("home", coppie.map((p) => p[0])),
    lato("away", coppie.map((p) => p[1])),
    "Casa", "Fuori",
  ));
  assert.ok(c !== null);
  assert.equal(c.tratti.length, 4, "quattro e non cinque");
  assert.match(c.mute ?? "", /non è in elenco/, "e il quinto si dichiara invece di sparire");
  // Il titolo resta di due parole anche con quattro righe sotto: quattro etichette in fila
  // non sono piu' un titolo.
  assert.equal(c.parole.length, 2);
  // Ogni riga porta la lettura da cui esce, cosi' la forma unica non perde il capitolo.
  assert.ok(c.tratti.every((t) => t.lettura.length > 0));
  assert.match(c.rigaBreve ?? "", /^Come si affrontano: /);
});

test("il testo che va in pagina e' scritto con gli accenti, non con gli apostrofi", () => {
  // Difetto vero, visto in pagina e non nel codice: «la lettura piu' netta e' passaggi».
  // Nei commenti l'apostrofo va bene, in cio' che legge l'utente no.
  const [pc, pf] = separaInCasa("precisione", 90, 80);
  const muta = voce("quota_area", con(0.6, 0.6), con(0.6, 0.6));
  const c = cappelloDi(comeSiAffrontano(
    lato("home", [pc, muta]), lato("away", [pf, muta]), "Casa", "Fuori",
  ));
  const zitto = cappelloDi(comeSiAffrontano(
    lato("home", [voce("precisione", con(80, 80), con(80, 80))]),
    lato("away", [voce("precisione", con(80, 80), con(80, 80))]),
    "Casa", "Fuori",
  ));
  const testi = [
    c?.titolo, c?.fase, c?.mute, c?.nota, c?.rigaBreve,
    ...(c?.tratti ?? []).flatMap((t) => [t.parola, t.nome, ...t.punti.map((p) => p.chi)]),
    zitto?.titolo, zitto?.nota,
  ].filter((t): t is string => typeof t === "string");
  assert.ok(testi.length > 8, "niente da controllare: la prova non direbbe nulla");
  for (const t of testi) {
    assert.doesNotMatch(
      t, /\b(e|piu|perche|cosi|qualita|gia|puo|ne|li|pero|sara|citta|meta)'/,
      `«${t}» porta un apostrofo dove serve un accento`,
    );
  }
});

test("la tabella completa ha ogni metrica dai due lati, e gli stessi numeri delle prove", () => {
  // **E' cio' che era la sezione «Il contesto».** Faceva lo stesso confronto con un'altra
  // finestra, e per lo stesso fatto scriveva 18,4 dove il capitolo scriveva 18,9. Qui la
  // finestra e' una: la tabella e le prove devono dire lo stesso numero.
  const [pc, pf] = separaInCasa("precisione", 90, 80);
  const quieto = voce("palle_lunghe", con(52, 52), con(52, 52));
  const c = cappelloDi(comeSiAffrontano(
    lato("home", [pc, quieto]), lato("away", [pf, quieto]), "Casa", "Fuori",
  ));
  assert.ok(c !== null);
  // Due metriche, due direzioni: quattro righe.
  assert.equal(c.tutte.length, 4);
  assert.deepEqual(
    [...new Set(c.tutte.map((t) => t.punti[0].chi))].sort(),
    ["Casa", "Fuori"],
    "la tabella guarda tutt'e due le direzioni",
  );
  // La metrica che non si scosta resta in tabella, senza verso e senza parola inventata.
  const ferma = c.tutte.filter((t) => t.nome === "palle_lunghe");
  assert.equal(ferma.length, 2);
  assert.ok(ferma.every((t) => t.verso === 0), "senza scostamento non si dichiara un verso");

  // **Un lato solo non basta neanche in tabella.** Qui chi attacca si scosta davvero, ma
  // chi gli sta davanti e' in linea: il verso non si dichiara. Senza questo caso il
  // controllo si poteva togliere senza che nulla arrossisse.
  const meta = cappelloDi(comeSiAffrontano(
    lato("home", [voce("cross", con(30, 20), con(20, 20))]),
    lato("away", [voce("cross", con(20, 20), con(20, 20))]),
    "Casa", "Fuori",
  ));
  const rigaCasa = meta?.tutte.find((t) => t.punti[0].chi === "Casa");
  assert.ok(rigaCasa !== undefined);
  assert.equal(rigaCasa.verso, 0, "chi attacca si scosta, chi difende no: niente verso");

  // Una prova e la sua riga in tabella devono portare gli stessi numeri: e' il punto.
  const prova = c.tratti[0];
  assert.ok(prova !== undefined);
  const stessa = c.tutte.find((t) => t.chiave === prova.chiave);
  assert.ok(stessa !== undefined, "la prova deve stare anche nella tabella");
  assert.equal(stessa.punti[0].valore, prova.punti[0].valore);
  assert.equal(stessa.punti[1].valore, prova.punti[1].valore);
  assert.equal(stessa.metro, prova.metro);
});
