// L'istante di lettura deve venire dalla richiesta alla fonte, non dal momento del render.
//
// **Perche' esiste questa prova.** Gli endpoint del calendario e dei pronostici non
// espongono nessun campo di aggiornamento - misurato su 50 gare: `last_updated`,
// `updated_at`, `latest` e `as_of` sono tutti assenti - quindi l'unico istante vero e'
// quello in cui abbiamo chiesto. Ma la risposta resta in cache 120 secondi: se `lettoIl`
// nascesse al render, la pagina scriverebbe un'ora in cui nessuno ha parlato con la fonte.
// Qui si verifica che due letture dentro la finestra dichiarino lo stesso istante.
import assert from "node:assert/strict";
import test from "node:test";

import { getMatchesByDate } from "../src/server/iqstats/matches.ts";
import { getUpcomingPredictions } from "../src/server/iqstats/predictions.ts";

const GIORNO = "2026-08-24";

const GARA = {
  id: 1, league_id: 1, home_team: "Casa", away_team: "Ospite",
  home_team_id: 10, away_team_id: 11,
  event_date: `${GIORNO}T18:00:00+00:00`, status: "notstarted",
};

const PRONOSTICO = {
  event_id: 1, home_team: "Casa", away_team: "Ospite",
  event_date: `${GIORNO}T18:00:00+00:00`,
  markets: { match_result: { prob_home: 50, prob_draw: 25, prob_away: 25, predicted: "H" } },
};

/** Conta le chiamate e risponde sempre la stessa pagina: una sola, cosi' la paginazione chiude. */
function fonteFinta(righe: readonly unknown[]) {
  let chiamate = 0;
  const indirizzi: string[] = [];
  const originale = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    chiamate += 1;
    const indirizzo = String(input);
    indirizzi.push(indirizzo);
    const results = indirizzo.includes("/leagues/") ? [] : righe;
    return new Response(JSON.stringify({ results, next: null, count: results.length }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return {
    chiamate: () => chiamate,
    indirizzi: () => indirizzi as readonly string[],
    ripristina: () => { globalThis.fetch = originale; },
  };
}

test("l'istante delle gare e' quello della lettura, non del render", async () => {
  process.env.IQSTATS_PROVIDER_TOKEN = "prova";
  process.env.IQSTATS_PROVIDER_BASE_URL = "https://esempio.invalid/";
  const fonte = fonteFinta([GARA]);
  try {
    const prima = Date.now();
    const uno = await getMatchesByDate(GIORNO);
    const dopo = Date.now();

    assert.equal(uno.source, "provider", `la fonte finta non ha risposto: ${uno.reason ?? ""}`);
    assert.ok(uno.lettoIl !== undefined, "nessun istante di lettura dichiarato");
    const istante = new Date(uno.lettoIl).getTime();
    assert.ok(
      istante >= prima && istante <= dopo,
      `l'istante ${uno.lettoIl} cade fuori dalla finestra della richiesta`,
    );

    const chiamateDopoLaPrima = fonte.chiamate();
    // Una seconda lettura dentro i 120 secondi non parla con la fonte: se `lettoIl` fosse
    // preso al momento della risposta invece che al momento della richiesta vera, qui
    // cambierebbe, e la pagina direbbe un'ora inventata.
    await new Promise((risolvi) => setTimeout(risolvi, 15));
    const due = await getMatchesByDate(GIORNO);
    assert.equal(fonte.chiamate(), chiamateDopoLaPrima, "la cache non ha trattenuto la risposta");
    assert.equal(due.lettoIl, uno.lettoIl, "due letture della stessa risposta, due istanti diversi");
  } finally {
    fonte.ripristina();
  }
});

test("l'istante dei pronostici segue la stessa regola", async () => {
  process.env.IQSTATS_PROVIDER_TOKEN = "prova";
  process.env.IQSTATS_PROVIDER_BASE_URL = "https://esempio.invalid/";
  const fonte = fonteFinta([PRONOSTICO]);
  try {
    const prima = Date.now();
    const uno = await getUpcomingPredictions(7);
    const dopo = Date.now();

    assert.equal(uno.source, "provider", `la fonte finta non ha risposto: ${uno.reason ?? ""}`);
    assert.ok(uno.lettoIl !== undefined, "nessun istante di lettura dichiarato");
    const istante = new Date(uno.lettoIl).getTime();
    assert.ok(istante >= prima && istante <= dopo, `istante ${uno.lettoIl} fuori finestra`);

    const chiamateDopoLaPrima = fonte.chiamate();
    await new Promise((risolvi) => setTimeout(risolvi, 15));
    const due = await getUpcomingPredictions(7);
    assert.equal(fonte.chiamate(), chiamateDopoLaPrima, "la cache non ha trattenuto la risposta");
    assert.equal(due.lettoIl, uno.lettoIl, "due letture della stessa risposta, due istanti diversi");
  } finally {
    fonte.ripristina();
  }
});

test("i pronostici si chiedono con una finestra di date, non con `upcoming`", async () => {
  // **Il difetto da impedire e' gia' successo.** `upcoming=true` non e' piu' fra i parametri
  // accettati - `date_from`, `date_to`, `league_id`, `limit`, `min_confidence`, `offset`,
  // `recommended`, `season_id`, `status`, `team_id` - e la fonte rispondeva
  // `400 Unknown query parameter(s): upcoming`. Il client traduce ogni risposta non ok in
  // `source_unavailable`, quindi /pronostici restava vuota dicendo «riprova fra qualche
  // minuto»: un guasto permanente raccontato come momentaneo.
  process.env.IQSTATS_PROVIDER_TOKEN = "prova";
  process.env.IQSTATS_PROVIDER_BASE_URL = "https://esempio.invalid/";
  const fonte = fonteFinta([PRONOSTICO]);
  try {
    await getUpcomingPredictions(3);
    const chiesti = fonte.indirizzi().filter((i) => i.includes("/predictions/"));
    assert.ok(chiesti.length > 0, "nessuna richiesta ai pronostici");
    for (const indirizzo of chiesti) {
      assert.ok(!indirizzo.includes("upcoming="), `parametro rifiutato dalla fonte: ${indirizzo}`);
      assert.ok(indirizzo.includes("date_from="), `manca date_from: ${indirizzo}`);
      assert.ok(indirizzo.includes("date_to="), `manca date_to: ${indirizzo}`);
    }
  } finally {
    fonte.ripristina();
  }
});
