// Le quote del banco accanto alle soglie del dossier: quale prezzo va su quale riga.
//
// Fino al 12 settembre 2026 le 3.397 linee di Fastbet stavano solo nella pagina Expected,
// e il dossier - quello che si apre cliccando una gara dal tabellone - mostrava 101 soglie
// del motore senza un prezzo accanto. Qui si verifica l'aggancio: il prezzo va sulla riga
// che ha lo stesso bersaglio, lo stesso lato, la stessa soglia e lo stesso verso, e su
// nessun'altra. Una soglia vicina non e' quella soglia.
import assert from "node:assert/strict";
import test from "node:test";

import { quoteDiGara, quoteRaccolteIl, type RigaQuotata } from "../src/server/iqstats/expected-famiglie.ts";

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
