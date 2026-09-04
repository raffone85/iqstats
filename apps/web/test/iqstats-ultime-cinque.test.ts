// Prove di «Come si presentano»: il verdetto e le tre differenze.
//
// La scelta delle differenze e la frase sono pure e si provano senza database. Gli
// invarianti della query girano solo con `IQSTATS_PROJECTION_DATABASE_URL`.
//
// Quello che sorvegliano: il carattere non si dichiara sotto tre gare per lato, le voci
// troppo rare non vincono il confronto perche' rumorose, le gare vengono tutte dalla
// stagione chiesta e nessuna e' successiva al calcio d'inizio.
import assert from "node:assert/strict";
import test from "node:test";

import { connessione } from "../src/server/iqstats/lettura.ts";
import { comeSiPresentano, confronto } from "../src/server/iqstats/ultime-cinque.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

const CASA = new Map([["xg", 2.06], ["tiri", 17.8], ["porta", 6.2], ["palla", 58]]);
const FUORI = new Map([["xg", 1.66], ["tiri", 10.2], ["porta", 3.4], ["palla", 44]]);

// ------------------------------------------------------------------ la scelta

test("si mostrano tre differenze, le piu' marcate, con la casa davanti dichiarata", () => {
  const { differenze } = confronto(CASA, FUORI, "Casa", "Fuori", 5, 5);
  assert.equal(differenze.length, 3);
  // In quota sul totale: tiri in porta 0,29, tiri 0,27, possesso 0,14, gol attesi 0,11.
  // Escono i primi tre nell'ordine, e i gol attesi - lo scarto piu' stretto - restano fuori.
  assert.deepEqual(differenze.map((d) => d.chiave), ["porta", "tiri", "palla"]);
  assert.ok(!differenze.some((d) => d.chiave === "xg"));
  assert.ok(differenze.every((d) => d.avantiLaCasa));
});

test("una voce troppo rara non vince il confronto", () => {
  // Due occasioni contro zero sarebbe il 100% di scarto: e' rumore, non carattere.
  const casa = new Map([["occasioni", 1.2], ["tiri", 14], ["porta", 5]]);
  const fuori = new Map([["occasioni", 0.2], ["tiri", 12], ["porta", 4]]);
  const { differenze } = confronto(casa, fuori, "Casa", "Fuori", 5, 5);
  assert.ok(!differenze.some((d) => d.chiave === "occasioni"), "le occasioni sono entrate");
});

test("sotto tre gare per lato il carattere non si dichiara", () => {
  assert.equal(confronto(CASA, FUORI, "Casa", "Fuori", 2, 5).verdetto, null);
  assert.equal(confronto(CASA, FUORI, "Casa", "Fuori", 5, 1).verdetto, null);
  // I numeri pero' restano: si mostrano, senza la frase che li interpreta.
  assert.equal(confronto(CASA, FUORI, "Casa", "Fuori", 1, 1).differenze.length, 3);
});

test("il verdetto segue chi sta davanti, e non promette niente su questa gara", () => {
  assert.equal(confronto(CASA, FUORI, "Casa", "Fuori", 5, 5).verdetto,
    "Gara sbilanciata: Casa comanda in casa");
  assert.equal(confronto(FUORI, CASA, "Casa", "Fuori", 5, 5).verdetto,
    "Fuori arriva meglio, e gioca fuori");
  const misto = confronto(
    new Map([["xg", 2.0], ["tiri", 10], ["porta", 6]]),
    new Map([["xg", 1.0], ["tiri", 16], ["porta", 3]]),
    "Casa", "Fuori", 5, 5,
  );
  assert.equal(misto.verdetto, "Squadre vicine: si decide sui dettagli");
  for (const v of ["Gara sbilanciata: Casa comanda in casa", misto.verdetto]) {
    const testo = (v ?? "").toLowerCase();
    for (const parola of ["probabil", "previs", "quota", "vincer", "over ", "under "]) {
      assert.ok(!testo.includes(parola), `il verdetto usa «${parola}»: ${testo}`);
    }
  }
});

test("senza metriche in comune non esce un confronto", () => {
  const { differenze, verdetto } = confronto(
    new Map([["xg", 1.2]]), new Map([["falli", 12]]), "Casa", "Fuori", 5, 5,
  );
  assert.equal(differenze.length, 0);
  assert.equal(verdetto, null);
});

// ------------------------------------------------------------ gli invarianti

test("le gare sono della stagione chiesta, dal lato chiesto e prima del via", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const righe = await sql<{
    casa: string; fuori: string; lega: string; stagione: string; quando: string; nome: string;
  }[]>`
    select th.source_id::text as casa, ta.source_id::text as fuori,
           c.source_id::text as lega, s.source_id::text as stagione,
           m.kickoff_at::text as quando, th.name as nome
    from football.matches m
    join football.teams th on th.id = m.home_team_id
    join football.teams ta on ta.id = m.away_team_id
    join football.competitions c on c.id = m.competition_id
    join football.seasons s on s.id = m.season_id
    where (select count(*) from football.team_match_observations x
             where x.team_id = m.home_team_id and x.side = 'home'
               and x.season_id = m.season_id and x.kickoff_at < m.kickoff_at) >= 3
      and (select count(*) from football.team_match_observations x
             where x.team_id = m.away_team_id and x.side = 'away'
               and x.season_id = m.season_id and x.kickoff_at < m.kickoff_at) >= 3
    order by m.kickoff_at desc
    limit 1
  `;
  const caso = righe[0];
  assert.ok(caso !== undefined, "nessuna gara con tre precedenti per lato in stagione");

  const letto = await comeSiPresentano(
    Number(caso.casa), Number(caso.fuori), Number(caso.lega), Number(caso.stagione), caso.quando,
  );
  assert.ok(letto !== null, "nessun confronto");
  assert.equal(letto.casa.nome, caso.nome);
  assert.ok(letto.casa.gare.length > 0 && letto.casa.gare.length <= 5);
  assert.ok(letto.differenze.length > 0 && letto.differenze.length <= 3);
  assert.notEqual(letto.verdetto, null, "con tre gare per lato il verdetto ci deve essere");
  for (const g of [...letto.casa.gare, ...letto.trasferta.gare]) {
    assert.ok(new Date(g.quando) < new Date(caso.quando), "una gara successiva e' entrata");
    assert.ok(g.avversario.length > 0, "un avversario senza nome");
  }
  // Tutte le gare lette devono stare nella stagione chiesta: e' la regola per cui
  // l'anno scorso non entra.
  const dentro = await sql<{ n: string }[]>`
    select count(*)::text as n
    from football.team_match_observations o
    join football.teams t on t.id = o.team_id
    join football.seasons s on s.id = o.season_id
    where t.source_id = ${Number(caso.casa)}::bigint
      and s.source_id = ${Number(caso.stagione)}::bigint
      and o.side = 'home'
      and o.kickoff_at < ${caso.quando}::timestamptz
  `;
  assert.ok(Number(dentro[0].n) >= letto.casa.gare.length,
    "sono entrate piu' gare di quante ne abbia la stagione");
});

test("senza gare in questa stagione non esce un confronto inventato", opzioni, async () => {
  assert.equal(
    await comeSiPresentano(999_999_999, 999_999_998, 999_999_997, 999_999_996,
      new Date().toISOString()),
    null,
  );
});
