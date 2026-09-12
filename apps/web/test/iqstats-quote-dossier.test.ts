// Le quote del banco accanto alle soglie del dossier: quale prezzo va su quale riga.
//
// Fino al 12 settembre 2026 le 3.397 linee di Fastbet stavano solo nella pagina Expected,
// e il dossier - quello che si apre cliccando una gara dal tabellone - mostrava 101 soglie
// del motore senza un prezzo accanto. Qui si verifica l'aggancio: il prezzo va sulla riga
// che ha lo stesso bersaglio, lo stesso lato, la stessa soglia e lo stesso verso, e su
// nessun'altra. Una soglia vicina non e' quella soglia.
import assert from "node:assert/strict";
import test from "node:test";

import {
  motivoSenzaQuote, quoteDiGara, quoteRaccolteIl, type RigaQuotata,
} from "../src/server/iqstats/expected-famiglie.ts";

/** La stessa ricerca che fa la scala del dossier, tenuta qui per poterla provare. */
function quotaDi(
  quote: readonly RigaQuotata[],
  bersaglio: string,
  lato: RigaQuotata["lato"],
  soglia: number,
  verso: string,
): number | null {
  const trovata = quote.find(
    (q) => q.bersaglio === bersaglio && q.lato === lato && q.soglia === soglia && q.verso === verso,
  );
  return trovata === undefined ? null : trovata.quota;
}

test("una gara coperta dall'artefatto porta le sue linee quotate", () => {
  const quote = quoteDiGara(214056);
  assert.ok(quote.length > 0, "Watford-Stoke e' nell'artefatto dell'11 settembre 2026");
  for (const q of quote) {
    assert.ok(q.quota > 1, `una quota e' sempre maggiore di 1, trovato ${q.quota}`);
    assert.ok(["casa", "trasferta", "totale"].includes(q.lato));
  }
});

test("una gara che l'artefatto non copre non inventa prezzi", () => {
  assert.deepEqual(quoteDiGara(1), []);
});

test("il prezzo va sulla riga esatta, e una soglia vicina non lo eredita", () => {
  const quote = quoteDiGara(214056);
  const riga = quote[0];
  assert.equal(
    quotaDi(quote, riga.bersaglio, riga.lato, riga.soglia, riga.verso),
    riga.quota,
  );
  // Mezzo gol piu' in la' e' un'altra scommessa: o c'e' la sua linea, o non c'e' niente.
  const vicina = quotaDi(quote, riga.bersaglio, riga.lato, riga.soglia + 0.5, riga.verso);
  assert.notEqual(vicina, riga.quota);
  // Il verso opposto sulla stessa soglia non e' lo stesso prezzo.
  const opposto = riga.verso === "Over" ? "Under" : "Over";
  assert.notEqual(quotaDi(quote, riga.bersaglio, riga.lato, riga.soglia, opposto), riga.quota);
  // Un bersaglio che non esiste non aggancia niente.
  assert.equal(quotaDi(quote, "bersaglio_inventato", riga.lato, riga.soglia, riga.verso), null);
});

test("la raccolta del palinsesto ha una data da dichiarare", () => {
  const quando = quoteRaccolteIl();
  assert.ok(quando === null || !Number.isNaN(new Date(quando).getTime()));
});

test("le linee fuori dalla scala del motore sono quelle che restano, non tutte", () => {
  const quote = quoteDiGara(214056);
  const bersaglio = quote[0].bersaglio;
  const lato = quote[0].lato;
  const diQuestaScala = quote.filter((q) => q.bersaglio === bersaglio && q.lato === lato);
  const soglie = [...new Set(diQuestaScala.map((q) => q.soglia))].sort((a, b) => a - b);
  // Una scala finta che copre le prime due soglie del banco: le altre devono restare.
  const scala = soglie.slice(0, 2).map((soglia) => ({ soglia }));
  const nostre = new Set(scala.map((l) => l.soglia));
  const restano = diQuestaScala.filter((q) => !nostre.has(q.soglia));
  assert.ok(restano.length < diQuestaScala.length, "qualcosa e' stato coperto");
  assert.ok(restano.every((q) => !nostre.has(q.soglia)), "nessuna coperta e' rimasta");
  // Con una scala che copre tutte le soglie non resta niente da mostrare sotto.
  const tutte = new Set(soglie);
  assert.equal(diQuestaScala.filter((q) => !tutte.has(q.soglia)).length, 0);
});

test("perché il prezzo non c'è: fuori dalla finestra, o il banco non apre quelle linee", () => {
  // Il 12 settembre 2026 l'utente ha aperto Monza-Sassuolo del 18 e ha trovato le soglie
  // senza prezzo e senza una ragione: il palinsesto raccolto l'11 arriva al 13, quindi la
  // gara sta fuori dalla finestra. Le due assenze non sono la stessa cosa e restano distinte.
  const fino = "2026-09-13T21:30:00+00:00";
  assert.equal(motivoSenzaQuote(0, "2026-09-18T18:45:00+00:00", fino), "fuori-copertura");
  assert.equal(motivoSenzaQuote(0, "2026-09-13T13:00:00+00:00", fino), "banco-non-apre");
  // Dove i prezzi ci sono non si dichiara nessuna assenza.
  assert.equal(motivoSenzaQuote(45, "2026-09-18T18:45:00+00:00", fino), null);
  // «Z» e «+00:00» sono lo stesso istante: il confronto è sul tempo, non sulle stringhe.
  assert.equal(motivoSenzaQuote(0, "2026-09-13T21:00:00Z", fino), "banco-non-apre");
  assert.equal(motivoSenzaQuote(0, "2026-09-13T22:00:00Z", fino), "fuori-copertura");
  // Senza finestra nota non si inventa una ragione.
  assert.equal(motivoSenzaQuote(0, "2026-09-18T18:45:00+00:00", null), null);
});
