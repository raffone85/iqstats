// **La scheda dell'arbitro promette due cose, e tutte e due si rompono in silenzio.**
//
// La prima e' che ogni numero sia una **media a partita** con il suo campione accanto, anche
// quando le partite sono una sola: nasconderla toglierebbe proprio l'informazione che serve,
// cioe' che li' ha diretto. La seconda e' che **un'assenza non diventi mai uno zero**: nel
// livello dati ci sono ventisei coppie arbitro-competizione senza un solo dato sui falli, e
// altre settantatre che li hanno a meta'. Una `sum()` distratta le trasformerebbe in «0,00
// falli a partita», che si legge come «non ne fischia», ed e' falso.
//
// La terza cosa che si rompe da sola e' l'etichetta della stagione: nel livello dati locale
// **7.892 gare arbitrate su 9.384** stanno in stagioni che si chiamano «Stagione 29
// (segnaposto locale)». Se l'etichetta tornasse a leggere il nome, la scheda mostrerebbe
// quel segnaposto in tabella.
import assert from "node:assert/strict";
import test from "node:test";

import {
  etichettaStagione,
  giudizioSulMetro,
  medieDaMostrare,
  medieDelPeriodo,
  perStagioneCompetizione,
  type GaraDiretta,
} from "../src/server/iqstats/referees.ts";

function gara(patch: Partial<GaraDiretta> & { readonly quando: string }): GaraDiretta {
  return {
    matchSourceId: null,
    competizione: "Serie A",
    competitionSourceId: 1,
    seasonId: 10,
    stagione: "2026",
    stagioneCorrente: true,
    casa: "Casa",
    trasferta: "Ospite",
    golCasa: 1, golTrasferta: 0,
    golCasaPrimoTempo: null, golTrasfertaPrimoTempo: null,
    falli: 20, gialli: 4, rossi: 0,
    falliCasa: 10, falliTrasferta: 10,
    gialliCasa: 2, gialliTrasferta: 2,
    ...patch,
  };
}

test("una gara sola fa comunque una riga, con la sua media e il campione che ha", () => {
  const righe = perStagioneCompetizione([
    gara({ quando: "2026-05-01T18:00:00Z", competizione: "UEFA Champions League", falli: 23, gialli: 8 }),
  ]);
  assert.equal(righe.length, 1);
  assert.equal(righe[0]!.partite, 1);
  assert.equal(righe[0]!.falli, 23);
  assert.equal(righe[0]!.gialli, 8);
  assert.equal(righe[0]!.partiteConGialli, 1);
});

test("i falli assenti non diventano zero, e non trascinano giu' la media", () => {
  const righe = perStagioneCompetizione([
    gara({ quando: "2026-05-01T18:00:00Z", falli: null, falliCasa: null, falliTrasferta: null, gialli: 6 }),
    gara({ quando: "2026-05-08T18:00:00Z", falli: null, falliCasa: null, falliTrasferta: null, gialli: 7 }),
  ]);
  const riga = righe[0]!;
  assert.equal(riga.falli, null, "senza dato la media dei falli e' un'assenza, non uno zero");
  assert.equal(riga.partiteConFalli, 0);
  assert.equal(riga.gialli, 6.5, "i gialli restano leggibili anche dove i falli mancano");
  assert.equal(riga.partiteConGialli, 2);
  assert.equal(riga.falliPerAmmonizione, null, "senza falli il rapporto non esiste");
  assert.equal(riga.quotaFalliCasa, null);
});

test("il campione di ogni metrica e' il suo, non quello della riga", () => {
  const m = medieDelPeriodo([
    gara({ quando: "2026-05-01T18:00:00Z", falli: 20, gialli: 4 }),
    gara({ quando: "2026-05-08T18:00:00Z", falli: null, gialli: 6 }),
  ]);
  assert.equal(m.partite, 2);
  assert.equal(m.falli, 20, "la media dei falli si fa sulle gare che il dato ce l'hanno");
  assert.equal(m.partiteConFalli, 1);
  assert.equal(m.gialli, 5);
  assert.equal(m.partiteConGialli, 2);
});

test("la ripartizione casa/trasferta si fa sui totali dei due lati, non sulle medie", () => {
  const righe = perStagioneCompetizione([
    gara({ quando: "2026-05-01T18:00:00Z", gialliCasa: 1, gialliTrasferta: 3, falliCasa: 8, falliTrasferta: 12 }),
    gara({ quando: "2026-05-08T18:00:00Z", gialliCasa: 3, gialliTrasferta: 1, falliCasa: 12, falliTrasferta: 8 }),
  ]);
  assert.equal(righe[0]!.quotaGialliCasa, 0.5);
  assert.equal(righe[0]!.quotaFalliCasa, 0.5);
});

test("senza un solo cartellino non si divide per zero: la ripartizione e' un'assenza", () => {
  const righe = perStagioneCompetizione([
    gara({ quando: "2026-05-01T18:00:00Z", gialli: 0, gialliCasa: 0, gialliTrasferta: 0 }),
  ]);
  assert.equal(righe[0]!.quotaGialliCasa, null);
  assert.equal(righe[0]!.falliPerAmmonizione, null, "zero ammonizioni non fa un rapporto infinito");
});

test("falli per ammonizione e' il rapporto fra le due medie", () => {
  const righe = perStagioneCompetizione([
    gara({ quando: "2026-05-01T18:00:00Z", falli: 25, gialli: 5 }),
    gara({ quando: "2026-05-08T18:00:00Z", falli: 27, gialli: 5 }),
  ]);
  assert.equal(righe[0]!.falliPerAmmonizione, 26 / 5);
});

test("stagione e competizione fanno righe diverse, e la piu' recente sta in cima", () => {
  const righe = perStagioneCompetizione([
    gara({ quando: "2025-05-01T18:00:00Z", seasonId: 9, stagione: "2025", stagioneCorrente: false }),
    gara({ quando: "2026-05-01T18:00:00Z", competizione: "Coppa", competitionSourceId: 2 }),
    gara({ quando: "2026-08-01T18:00:00Z" }),
  ]);
  assert.equal(righe.length, 3);
  assert.equal(righe[0]!.competizione, "Serie A");
  assert.equal(righe[0]!.stagione, "2026");
  assert.equal(righe.at(-1)!.stagione, "2025");
});

test("il banner legge la stagione corrente solo quando regge, e dichiara il ripiego", () => {
  const cinque = Array.from({ length: 5 }, (_, i) =>
    gara({ quando: `2026-05-0${i + 1}T18:00:00Z`, falli: 20 + i }));
  const conStagione = medieDaMostrare(cinque, 1);
  assert.equal(conStagione?.provenienza, "stagione");
  assert.equal(conStagione?.partite, 5);
  assert.equal(conStagione?.stagione, "2026");

  const dueInStagione = medieDaMostrare([
    ...cinque.slice(0, 2),
    ...Array.from({ length: 6 }, (_, i) => gara({
      quando: `2025-05-0${i + 1}T18:00:00Z`, seasonId: 9, stagione: "2025",
      stagioneCorrente: false, falli: 30,
    })),
  ], 1);
  assert.equal(dueInStagione?.provenienza, "competizione", "due gare non fanno una stagione");
  assert.equal(dueInStagione?.partite, 8, "il ripiego resta dentro la stessa competizione");
  assert.equal(dueInStagione?.partiteInStagione, 2, "quante ne ha in stagione si dice lo stesso");
});

// **Il numero e il giudizio devono uscire dalle stesse gare.** Prima non era cosi': il
// banner mostrava la media di tutte le competizioni e la confrontava con il metro di questa
// lega, e su un arbitro vero e' uscito «SEVERO» sopra 3,71 gialli contro 4,32 dei colleghi,
// cioe' un'etichetta che contraddiceva il numero che le stava sotto.
test("il ripiego non esce dalla competizione della gara finche' ha gare li'", () => {
  const inLega = Array.from({ length: 3 }, (_, i) => gara({
    quando: `2025-05-0${i + 1}T18:00:00Z`, seasonId: 9, stagione: "2025",
    stagioneCorrente: false, gialli: 3,
  }));
  const altrove = Array.from({ length: 9 }, (_, i) => gara({
    quando: `2025-06-0${i + 1}T18:00:00Z`, competizione: "Coppa", competitionSourceId: 2,
    seasonId: 9, stagione: "2025", stagioneCorrente: false, gialli: 9,
  }));
  const b = medieDaMostrare([...inLega, ...altrove], 1);
  assert.equal(b?.provenienza, "competizione");
  assert.equal(b?.partite, 3, "le gare della coppa non entrano nella media di questa lega");
  assert.equal(b?.gialli, 3, "altrimenti il numero direbbe una cosa e il metro un'altra");
});

test("senza gare in quella competizione si guarda tutto, e allora niente giudizio", () => {
  const altrove = Array.from({ length: 4 }, (_, i) => gara({
    quando: `2025-06-0${i + 1}T18:00:00Z`, competizione: "Coppa", competitionSourceId: 2,
    stagioneCorrente: false,
  }));
  const b = medieDaMostrare(altrove, 77);
  assert.equal(b?.provenienza, "tutte");
  assert.equal(b?.partite, 4);
});

test("senza nemmeno una gara il banner non inventa una media", () => {
  assert.equal(medieDaMostrare([], 1), null);
});

test("l'etichetta della stagione esce dalle date, anche quando il nome e' un segnaposto", () => {
  assert.equal(
    etichettaStagione("calendar_year", "2025-03-29", "2025-12-07", "Stagione 29 (segnaposto locale)"),
    "2025",
  );
  assert.equal(
    etichettaStagione("cross_year", "2025-08-22", "2026-05-25", "Stagione 228 (segnaposto locale)"),
    "25/26",
  );
  assert.equal(etichettaStagione("cross_year", null, null, "Pro League 26/27"), "26/27");
  assert.equal(etichettaStagione(null, null, null, "Coppa senza date"), "Coppa senza date");
});

// **Il giudizio e' l'unica cosa della scheda che somiglia a un voto, quindi va difeso.**
//
// La soglia non e' scritta a mano: e' mezza dispersione fra gli arbitri di quella lega, che
// nei dati vale 0,71 gialli, il 18% del metro. Se qualcuno la sostituisse con un numero
// fisso, «severo» smetterebbe di voler dire «piu' severo dei suoi colleghi» e comincerebbe a
// voler dire «sopra una soglia che abbiamo deciso noi», che e' proprio cio' che il progetto
// vieta. E senza dispersione non si giudica affatto.

test("severo e permissivo si misurano sulla dispersione della lega, non su un numero fisso", () => {
  // Metro 4,50 e dispersione 0,80: la soglia e' 0,40, quindi 4,90 e 4,10 sono gli estremi.
  assert.equal(giudizioSulMetro(4.91, 4.5, 0.8), "severo");
  assert.equal(giudizioSulMetro(4.89, 4.5, 0.8), "in linea");
  assert.equal(giudizioSulMetro(4.11, 4.5, 0.8), "in linea");
  assert.equal(giudizioSulMetro(4.09, 4.5, 0.8), "permissivo");
});

test("in una lega dove gli arbitri si somigliano la soglia si stringe da sola", () => {
  // Stessa media e stesso metro, dispersione dimezzata: quello che era in linea diventa severo.
  assert.equal(giudizioSulMetro(4.8, 4.5, 0.8), "in linea");
  assert.equal(giudizioSulMetro(4.8, 4.5, 0.4), "severo");
});

test("senza metro o senza dispersione non si da' nessun giudizio", () => {
  assert.equal(giudizioSulMetro(5, null, 0.8), null);
  assert.equal(giudizioSulMetro(5, 4.5, null), null, "senza dispersione la soglia sarebbe inventata");
  assert.equal(giudizioSulMetro(5, 4.5, 0), null);
  assert.equal(giudizioSulMetro(null, 4.5, 0.8), null, "un'assenza non e' un arbitro permissivo");
});
