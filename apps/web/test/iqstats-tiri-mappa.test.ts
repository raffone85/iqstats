// Prove di «Da dove tirano».
//
// La regola di lettura e' pura e si prova senza database. Gli invarianti della query
// girano solo con `IQSTATS_PROJECTION_DATABASE_URL` e senza si saltano invece di
// fallire, come nelle altre suite.
//
// Quello che sorvegliano non e' «la quota e' questa» - cambia a ogni gara - ma le cose
// che, saltando, darebbero una pagina sbagliata senza che si veda: un verso dichiarato
// dove il campione non lo regge, una quota fuori scala, e il metro che sparisce.
import assert from "node:assert/strict";
import test from "node:test";

import { connessione } from "../src/server/iqstats/lettura.ts";
import {
  daDoveTirano,
  letturaDeiTiri,
  type ProfiloDiTiro,
  type VoceDiTiro,
} from "../src/server/iqstats/tiri-mappa.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

function voce(parziale: Partial<VoceDiTiro>): VoceDiTiro {
  return {
    chiave: "distanza",
    nome: "distanza del tiro",
    valore: 17.7,
    metro: 17.7,
    oltreIlRumore: false,
    parola: null,
    quota: false,
    ...parziale,
  };
}

function profilo(nome: string, voci: VoceDiTiro[]): ProfiloDiTiro {
  return { nome, gare: 12, tiri: 150, voci };
}

// ------------------------------------------------------------------ la lettura

test("senza scostamenti la frase non inventa un carattere", () => {
  const titolo = letturaDeiTiri(
    profilo("Genoa", [voce({})]),
    profilo("Como", [voce({})]),
  );
  assert.equal(titolo, "Due squadre che concludono come si conclude in questa competizione");
});

test("quando parla una sola squadra la frase e' sua", () => {
  const titolo = letturaDeiTiri(
    profilo("Genoa", [voce({ valore: 19.9, oltreIlRumore: true, parola: "tira da più lontano della media" })]),
    profilo("Como", [voce({})]),
  );
  assert.equal(titolo, "Genoa tira da più lontano della media");
});

test("stessa grandezza e stesso verso diventano una frase sola", () => {
  const parola = "tira da più lontano della media";
  const titolo = letturaDeiTiri(
    profilo("Genoa", [voce({ valore: 19.9, oltreIlRumore: true, parola })]),
    profilo("Como", [voce({ valore: 20.4, oltreIlRumore: true, parola })]),
  );
  assert.equal(titolo, "Tutt'e due tira da più lontano della media");
});

test("due caratteri diversi restano due", () => {
  const titolo = letturaDeiTiri(
    profilo("Genoa", [voce({ valore: 19.9, oltreIlRumore: true, parola: "tira da più lontano della media" })]),
    profilo("Como", [voce({
      chiave: "area", valore: 0.71, metro: 0.62, oltreIlRumore: true, quota: true,
      parola: "conclude più da vicino della media",
    })]),
  );
  assert.equal(
    titolo,
    "Genoa tira da più lontano della media, Como conclude più da vicino della media",
  );
});

test("una voce dentro l'errore non porta parola", () => {
  const v = voce({ valore: 17.8, metro: 17.7 });
  assert.equal(v.oltreIlRumore, false);
  assert.equal(v.parola, null);
});

// -------------------------------------------------------------- gli invarianti

interface Caso {
  readonly casa: string;
  readonly fuori: string;
  readonly lega: string;
  readonly stagione: string;
  readonly quando: string;
}

/**
 * Una gara **con la propria mappa dei tiri** e un campione alle spalle nella stessa
 * stagione.
 *
 * La mappa propria serve alla prova anti-leakage: la gara piu' recente dell'archivio e'
 * in calendario nel futuro e le sue righe non esistono ancora, quindi spostare l'istante
 * in avanti non farebbe entrare nulla e la prova non proverebbe niente.
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
    where exists (select 1 from football.team_match_shots sh where sh.match_id = m.id)
      and (
      select count(*) from football.team_match_shots sh
      join football.matches m2 on m2.id = sh.match_id
      where m2.season_id = m.season_id and sh.kickoff_at < m.kickoff_at
        and sh.team_id = m.home_team_id
    ) >= 6
      and (
      select count(*) from football.team_match_shots sh
      join football.matches m2 on m2.id = sh.match_id
      where m2.season_id = m.season_id and sh.kickoff_at < m.kickoff_at
        and sh.team_id = m.away_team_id
    ) >= 6
    order by m.kickoff_at desc
    limit 1
  `;
  return righe[0];
}

test("le quote stanno in scala e il metro c'e' sempre", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const caso = await casoConCampione(sql);
  assert.ok(caso !== undefined, "nessuna gara con campione di tiri");

  const lettura = await daDoveTirano(
    Number(caso.casa), Number(caso.fuori), Number(caso.lega),
    [Number(caso.stagione)], caso.quando,
  );
  assert.ok(lettura !== null, "nessuna lettura");
  for (const p of [lettura.casa, lettura.trasferta]) {
    assert.ok(p.gare >= 4, `${p.nome}: campione sotto la soglia`);
    assert.ok(p.tiri > 0, `${p.nome}: nessun tiro dietro le medie`);
    for (const v of p.voci) {
      if (v.quota) {
        assert.ok(v.valore >= 0 && v.valore <= 1, `${p.nome}/${v.nome}: quota fuori scala`);
        assert.ok(v.metro >= 0 && v.metro <= 1, `${p.nome}/${v.nome}: metro fuori scala`);
      } else {
        assert.ok(v.valore > 0, `${p.nome}/${v.nome}: valore non positivo`);
        assert.ok(v.metro > 0, `${p.nome}/${v.nome}: metro non positivo`);
      }
      // Il verso dichiarato deve stare dalla parte in cui il valore sta davvero.
      if (v.oltreIlRumore) {
        assert.ok(v.parola !== null, `${p.nome}/${v.nome}: dichiara senza parola`);
        assert.notEqual(v.valore, v.metro, `${p.nome}/${v.nome}: dichiara senza scarto`);
      } else {
        assert.equal(v.parola, null, `${p.nome}/${v.nome}: parola senza dichiarazione`);
      }
    }
  }
});

test("una gara futura non entra nei numeri che la leggono", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null);
  const caso = await casoConCampione(sql);
  assert.ok(caso !== undefined);

  const prima = await daDoveTirano(
    Number(caso.casa), Number(caso.fuori), Number(caso.lega),
    [Number(caso.stagione)], caso.quando,
  );
  const dopo = await daDoveTirano(
    Number(caso.casa), Number(caso.fuori), Number(caso.lega), [Number(caso.stagione)],
    new Date(new Date(caso.quando).getTime() + 86_400_000).toISOString(),
  );
  assert.ok(prima !== null && dopo !== null);
  assert.ok(
    dopo.casa.gare > prima.casa.gare || dopo.trasferta.gare > prima.trasferta.gare,
    "la gara letta non e' entrata dopo il calcio d'inizio",
  );
});

test("senza stagioni non esce una lettura", opzioni, async () => {
  assert.equal(
    await daDoveTirano(1, 2, 3, [], new Date().toISOString()),
    null,
  );
});

test("squadre che non esistono non producono una lettura inventata", opzioni, async () => {
  assert.equal(
    await daDoveTirano(999_999_999, 999_999_998, 999_999_997, [999_999_996],
      new Date().toISOString()),
    null,
  );
});
