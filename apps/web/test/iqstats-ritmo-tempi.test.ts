// Prove del ritmo fra primo e secondo tempo.
//
// La regola di lettura e' pura e si prova senza database. Gli invarianti della
// query girano solo con `IQSTATS_PROJECTION_DATABASE_URL`, come `test:lati`, e
// senza si saltano invece di fallire.
//
// Quello che sorvegliano non e' «la quota e' questa» - cambia a ogni gara - ma le
// cose che, saltando, darebbero una pagina sbagliata senza che si veda: una quota
// fuori da zero e uno, una tendenza dichiarata dove il campione non la regge, e la
// somma delle due quote che non fa uno.
import assert from "node:assert/strict";
import test from "node:test";

import { connessione } from "../src/server/iqstats/lettura.ts";
import { letturaDeiTempi, ritmoDeiTempi, type QuotaDiTempo } from "../src/server/iqstats/ritmo-tempi.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

function voce(parziale: Partial<QuotaDiTempo>): QuotaDiTempo {
  return {
    chiave: "tiri",
    nome: "tiri",
    gare: 40,
    quotaPrimo: 0.5,
    primo: 10,
    secondo: 10,
    oltreIlRumore: false,
    ...parziale,
  };
}

// ------------------------------------------------------------------ la lettura

test("senza una metrica che si distingue la frase non promette una tendenza", () => {
  const lettura = letturaDeiTempi([
    voce({ chiave: "tiri", quotaPrimo: 0.49 }),
    voce({ chiave: "corner", quotaPrimo: 0.52 }),
  ]);
  assert.ok(lettura !== null);
  assert.equal(lettura.titolo, "La produzione è equilibrata fra i due tempi");
  // Si mostrano comunque due voci: il dato descrittivo resta, la conclusione no.
  assert.equal(lettura.voci.length, 2);
});

test("quando tutte le metriche che parlano pendono di la', la frase lo dice", () => {
  const lettura = letturaDeiTempi([
    voce({ chiave: "xg", quotaPrimo: 0.42, oltreIlRumore: true }),
    voce({ chiave: "tiri", quotaPrimo: 0.46, oltreIlRumore: true }),
    voce({ chiave: "corner", quotaPrimo: 0.51 }),
  ]);
  assert.ok(lettura !== null);
  assert.equal(lettura.titolo, "Il ritmo cresce nella ripresa");
  // Escono solo quelle che si distinguono, e fra loro vince lo scarto piu' largo: la
  // terza resta fuori perche' non aggiunge un'informazione, aggiunge una riga.
  assert.deepEqual(lettura.voci.map((v) => v.chiave), ["xg", "tiri"]);
});

test("il primo tempo si dichiara solo quando e' il primo tempo a pendere", () => {
  const lettura = letturaDeiTempi([voce({ quotaPrimo: 0.58, oltreIlRumore: true })]);
  assert.ok(lettura !== null);
  assert.equal(lettura.titolo, "Il primo tempo concentra più produzione");
});

test("due tendenze opposte non diventano una tendenza sola", () => {
  const lettura = letturaDeiTempi([
    voce({ chiave: "xg", quotaPrimo: 0.58, oltreIlRumore: true }),
    voce({ chiave: "falli", quotaPrimo: 0.44, oltreIlRumore: true }),
  ]);
  assert.ok(lettura !== null);
  assert.equal(lettura.titolo, "Fra i due tempi cambia la produzione, ma non nella stessa direzione");
});

test("non si mostrano piu' di quattro voci", () => {
  const lettura = letturaDeiTempi(
    ["xg", "tiri", "porta", "corner", "falli"].map((chiave, i) =>
      voce({ chiave, quotaPrimo: 0.40 + i * 0.01, oltreIlRumore: true })),
  );
  assert.ok(lettura !== null);
  assert.equal(lettura.voci.length, 4);
});

test("senza metriche non c'e' una lettura da dare", () => {
  assert.equal(letturaDeiTempi([]), null);
});

// -------------------------------------------------------------- gli invarianti

test("le quote stanno fra zero e uno e i due tempi sommano alla gara", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const righe = await sql<{ casa: string; fuori: string; quando: string }[]>`
    select th.source_id::text as casa, ta.source_id::text as fuori,
           m.kickoff_at::text as quando
    from football.matches m
    join football.teams th on th.id = m.home_team_id
    join football.teams ta on ta.id = m.away_team_id
    where exists (select 1 from football.team_match_halves h where h.team_id = m.home_team_id)
      and exists (select 1 from football.team_match_halves h where h.team_id = m.away_team_id)
    order by m.kickoff_at desc
    limit 1
  `;
  const caso = righe[0];
  assert.ok(caso !== undefined, "nessuna gara con i due tempi");

  const ritmo = await ritmoDeiTempi(Number(caso.casa), Number(caso.fuori), caso.quando);
  assert.ok(ritmo !== null, "nessuna lettura");
  assert.ok(ritmo.voci.length >= 2, "una lettura si regge su almeno due voci");
  for (const v of ritmo.voci) {
    assert.ok(v.quotaPrimo > 0 && v.quotaPrimo < 1, `${v.nome}: quota fuori scala`);
    assert.ok(v.gare >= 5, `${v.nome}: campione sotto la soglia`);
    assert.ok(v.primo >= 0 && v.secondo >= 0, `${v.nome}: un tempo negativo`);
    // La quota e' la media delle quote per gara, non il rapporto delle medie: le due
    // non coincidono, ma devono stare dalla stessa parte della meta'.
    const dalRapporto = v.primo / (v.primo + v.secondo);
    assert.equal(
      v.quotaPrimo > 0.5,
      dalRapporto > 0.5,
      `${v.nome}: la quota e le medie pendono da parti diverse`,
    );
  }
});

test("una gara futura non entra nei numeri che la leggono", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const righe = await sql<{ casa: string; fuori: string; quando: string }[]>`
    select th.source_id::text as casa, ta.source_id::text as fuori,
           m.kickoff_at::text as quando
    from football.matches m
    join football.teams th on th.id = m.home_team_id
    join football.teams ta on ta.id = m.away_team_id
    join football.team_match_halves h on h.match_id = m.id
    order by m.kickoff_at desc
    limit 1
  `;
  const caso = righe[0];
  assert.ok(caso !== undefined);

  // Alla vigilia di quella gara le sue righe non esistono ancora: la lettura presa un
  // istante prima non puo' contare piu' gare di quella presa un istante dopo.
  const prima = await ritmoDeiTempi(Number(caso.casa), Number(caso.fuori), caso.quando);
  const dopo = await ritmoDeiTempi(
    Number(caso.casa),
    Number(caso.fuori),
    new Date(new Date(caso.quando).getTime() + 86_400_000).toISOString(),
  );
  assert.ok(prima !== null && dopo !== null);
  const garePrima = prima.voci.find((v) => v.chiave === "tiri")?.gare ?? 0;
  const gareDopo = dopo.voci.find((v) => v.chiave === "tiri")?.gare ?? 0;
  assert.ok(gareDopo > garePrima, "la gara letta non e' entrata dopo il calcio d'inizio");
});

test("una squadra che non esiste non produce una lettura inventata", opzioni, async () => {
  assert.equal(await ritmoDeiTempi(999_999_999, 999_999_998, new Date().toISOString()), null);
});
