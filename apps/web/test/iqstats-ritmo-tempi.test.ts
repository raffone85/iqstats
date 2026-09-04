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

interface Caso {
  readonly casa: string;
  readonly fuori: string;
  readonly lega: string;
  readonly stagione: string;
  readonly quando: string;
}

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

function voce(parziale: Partial<QuotaDiTempo>): QuotaDiTempo {
  return {
    chiave: "tiri",
    nome: "tiri",
    gare: 40,
    quotaPrimo: 0.456,
    metro: 0.456,
    primo: 10,
    secondo: 10,
    oltreIlRumore: false,
    ...parziale,
  };
}

/**
 * Una gara **con i tempi propri e un campione alle spalle nella stessa stagione**.
 *
 * Dal filtro di stagione in poi la gara piu' recente dell'archivio non basta piu': a
 * inizio stagione ha pochi precedenti e la lettura non esiste, il che e' corretto ma
 * non prova niente. Qui ne serve una che una lettura la produca davvero.
 */
async function casoConCampione(
  sql: NonNullable<ReturnType<typeof connessione>>,
): Promise<Caso | undefined> {
  const righe = await sql<Caso[]>`
    select th.source_id::text as casa, ta.source_id::text as fuori,
           c.source_id::text as lega, s.source_id::text as stagione,
           m.kickoff_at::text as quando
    from football.matches m
    join football.teams th on th.id = m.home_team_id
    join football.teams ta on ta.id = m.away_team_id
    join football.competitions c on c.id = m.competition_id
    join football.seasons s on s.id = m.season_id
    where exists (select 1 from football.team_match_halves h where h.match_id = m.id)
      and (
        select count(distinct m2.id)
        from football.matches m2
        join football.team_match_halves h2 on h2.match_id = m2.id
        where m2.season_id = m.season_id
          and m2.kickoff_at < m.kickoff_at
          and (m2.home_team_id in (m.home_team_id, m.away_team_id)
               or m2.away_team_id in (m.home_team_id, m.away_team_id))
      ) >= 12
    order by m.kickoff_at desc
    limit 1
  `;
  return righe[0];
}

// ------------------------------------------------------------------ la lettura

test("senza una metrica che si distingue la frase non promette una tendenza", () => {
  const lettura = letturaDeiTempi([
    voce({ chiave: "tiri", quotaPrimo: 0.45 }),
    voce({ chiave: "corner", quotaPrimo: 0.48, metro: 0.474 }),
  ]);
  assert.ok(lettura !== null);
  assert.equal(lettura.titolo, "La produzione segue la media della competizione");
  // Si mostrano comunque due voci: il dato descrittivo resta, la conclusione no.
  assert.equal(lettura.voci.length, 2);
});

test("quando tutte le metriche che parlano pendono di la', la frase lo dice", () => {
  const lettura = letturaDeiTempi([
    voce({ chiave: "xg", quotaPrimo: 0.38, metro: 0.450, oltreIlRumore: true }),
    voce({ chiave: "tiri", quotaPrimo: 0.42, metro: 0.456, oltreIlRumore: true }),
    voce({ chiave: "corner", quotaPrimo: 0.47, metro: 0.474 }),
  ]);
  assert.ok(lettura !== null);
  assert.equal(lettura.titolo, "Carica nella ripresa più della media");
  // Escono solo quelle che si distinguono, e fra loro vince lo scarto piu' largo: la
  // terza resta fuori perche' non aggiunge un'informazione, aggiunge una riga.
  assert.deepEqual(lettura.voci.map((v) => v.chiave), ["xg", "tiri"]);
});

test("il primo tempo si dichiara solo quando e' il primo tempo a pendere", () => {
  const lettura = letturaDeiTempi([voce({ quotaPrimo: 0.53, oltreIlRumore: true })]);
  assert.ok(lettura !== null);
  assert.equal(lettura.titolo, "Parte più forte della media nel primo tempo");
});

test("due tendenze opposte non diventano una tendenza sola", () => {
  const lettura = letturaDeiTempi([
    voce({ chiave: "xg", quotaPrimo: 0.52, metro: 0.450, oltreIlRumore: true }),
    voce({ chiave: "falli", quotaPrimo: 0.43, metro: 0.475, oltreIlRumore: true }),
  ]);
  assert.ok(lettura !== null);
  assert.equal(lettura.titolo, "Si scosta dalla media, ma non nella stessa direzione");
});

test("non si mostrano piu' di quattro voci", () => {
  const lettura = letturaDeiTempi(
    ["xg", "tiri", "porta", "corner", "falli"].map((chiave, i) =>
      voce({ chiave, quotaPrimo: 0.36 + i * 0.01, oltreIlRumore: true })),
  );
  assert.ok(lettura !== null);
  assert.equal(lettura.voci.length, 4);
});

test("il verso lo decide il metro della lega, non la meta'", () => {
  // 46% nel primo tempo sta sotto la meta' ma **sopra** la media della competizione,
  // che e' 45%: la squadra parte piu' forte del solito, e chiamarla «cresce nella
  // ripresa» - come farebbe un confronto con lo 0,5 - direbbe il rovescio.
  const lettura = letturaDeiTempi([
    voce({ chiave: "xg", quotaPrimo: 0.46, metro: 0.450, oltreIlRumore: true }),
  ]);
  assert.ok(lettura !== null);
  assert.equal(lettura.titolo, "Parte più forte della media nel primo tempo");
});

test("senza il metro la voce si mostra ma non dichiara un verso", () => {
  const lettura = letturaDeiTempi([
    voce({ chiave: "xg", quotaPrimo: 0.38, metro: null, oltreIlRumore: false }),
    voce({ chiave: "tiri", quotaPrimo: 0.61, metro: null, oltreIlRumore: false }),
  ]);
  assert.ok(lettura !== null);
  assert.equal(lettura.titolo, "La produzione segue la media della competizione");
  assert.equal(lettura.voci.length, 2);
});

test("senza metriche non c'e' una lettura da dare", () => {
  assert.equal(letturaDeiTempi([]), null);
});

// -------------------------------------------------------------- gli invarianti

test("le quote stanno fra zero e uno e i due tempi sommano alla gara", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const caso = await casoConCampione(sql);
  assert.ok(caso !== undefined, "nessuna gara con campione in stagione");

  const ritmo = await ritmoDeiTempi(
    Number(caso.casa), Number(caso.fuori), Number(caso.lega), Number(caso.stagione), caso.quando,
  );
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
  const caso = await casoConCampione(sql);
  assert.ok(caso !== undefined);

  // Alla vigilia di quella gara le sue righe non esistono ancora: la lettura presa un
  // istante prima non puo' contare piu' gare di quella presa un istante dopo.
  const prima = await ritmoDeiTempi(
    Number(caso.casa), Number(caso.fuori), Number(caso.lega), Number(caso.stagione), caso.quando,
  );
  const dopo = await ritmoDeiTempi(
    Number(caso.casa),
    Number(caso.fuori),
    Number(caso.lega),
    Number(caso.stagione),
    new Date(new Date(caso.quando).getTime() + 86_400_000).toISOString(),
  );
  assert.ok(prima !== null && dopo !== null);
  const garePrima = prima.voci.find((v) => v.chiave === "tiri")?.gare ?? 0;
  const gareDopo = dopo.voci.find((v) => v.chiave === "tiri")?.gare ?? 0;
  assert.ok(gareDopo > garePrima, "la gara letta non e' entrata dopo il calcio d'inizio");
});

test("una squadra che non esiste non produce una lettura inventata", opzioni, async () => {
  assert.equal(
    await ritmoDeiTempi(999_999_999, 999_999_998, 999_999_997, null, new Date().toISOString()),
    null,
  );
});
