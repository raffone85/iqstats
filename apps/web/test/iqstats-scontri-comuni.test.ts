// Gli scontri comuni, ricontati a mano sul livello dati.
//
// Chiede al database e si salta senza connessione, come `test:lati` e `test:base-di-lega`.
import assert from "node:assert/strict";
import test from "node:test";

import { connessione } from "../src/server/iqstats/lettura.ts";
import { scontriComuni } from "../src/server/iqstats/scontri-comuni.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

test("il confronto sta sulle sole gare contro gli avversari comuni", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");

  // La coppia con piu' avversari in comune: si sceglie dai dati, non si scrive a mano.
  const coppie = await sql<{ comp: string; casa: string; fuori: string; comuni: string }[]>`
    with d as (select distinct team_id, competition_id, opponent_id from football.team_match_observations)
    select c.source_id::text as comp, ta.source_id::text as casa, tb.source_id::text as fuori,
           count(*)::text as comuni
    from d a
    join d b on b.competition_id = a.competition_id and b.team_id > a.team_id
            and b.opponent_id = a.opponent_id
    join football.competitions c on c.id = a.competition_id
    join football.teams ta on ta.id = a.team_id
    join football.teams tb on tb.id = b.team_id
    where a.opponent_id <> b.team_id and b.opponent_id <> a.team_id
    group by 1, 2, 3
    order by count(*) desc
    limit 1
  `;
  const q = coppie[0];
  assert.ok(q !== undefined, "nessuna coppia con avversari comuni");

  const dati = await scontriComuni(Number(q.comp), Number(q.casa), Number(q.fuori));
  assert.ok(dati !== null, "nessun confronto");
  assert.equal(dati.avversari, Number(q.comuni), "gli avversari comuni non tornano");

  const riconto = await sql<{ squadra: string; gare: string; tiri: string; n: string }[]>`
    with sq as (
      select id from football.teams
      where source_id in (${Number(q.casa)}::bigint, ${Number(q.fuori)}::bigint)
    ),
    loro as (
      select o.team_id, o.opponent_id
      from football.team_match_observations o
      join football.competitions c on c.id = o.competition_id
      where c.source_id = ${Number(q.comp)}::bigint
        and o.team_id in (select id from sq)
        and o.opponent_id not in (select id from sq)
      group by 1, 2
    ),
    comuni as (select opponent_id from loro group by 1 having count(distinct team_id) = 2)
    select t.source_id::text as squadra, count(*)::text as gare,
           avg(o.total_shots)::text as tiri, count(o.total_shots)::text as n
    from football.team_match_observations o
    join football.competitions c on c.id = o.competition_id
    join football.teams t on t.id = o.team_id
    where c.source_id = ${Number(q.comp)}::bigint
      and o.team_id in (select id from sq)
      and o.opponent_id in (select opponent_id from comuni)
    group by 1
  `;
  const rCasa = riconto.find((r) => r.squadra === q.casa);
  const rFuori = riconto.find((r) => r.squadra === q.fuori);
  assert.ok(rCasa !== undefined && rFuori !== undefined, "il riconto non ha risposto");
  assert.equal(dati.gareCasa, Number(rCasa.gare), "le gare di casa non tornano");
  assert.equal(dati.gareFuori, Number(rFuori.gare), "le gare di trasferta non tornano");

  const tiri = dati.voci.find((v) => v.chiave === "tiri");
  if (tiri !== undefined) {
    assert.ok(Math.abs(tiri.casa.media - Number(rCasa.tiri)) < 1e-9, "la media dei tiri non torna");
    assert.equal(tiri.casa.campione, Number(rCasa.n), "il campione dei tiri non torna");
  }

  // Le gare dirette fra le due squadre restano fuori: quelle sono il testa a testa.
  const dirette = await sql<{ n: string }[]>`
    with sq as (
      select id from football.teams
      where source_id in (${Number(q.casa)}::bigint, ${Number(q.fuori)}::bigint)
    ),
    loro as (
      select o.team_id, o.opponent_id
      from football.team_match_observations o
      join football.competitions c on c.id = o.competition_id
      where c.source_id = ${Number(q.comp)}::bigint
        and o.team_id in (select id from sq)
        and o.opponent_id not in (select id from sq)
      group by 1, 2
    ),
    comuni as (select opponent_id from loro group by 1 having count(distinct team_id) = 2)
    select count(*)::text as n from comuni where opponent_id in (select id from sq)
  `;
  assert.equal(Number(dirette[0]?.n), 0, "una delle due squadre e' finita fra i propri avversari comuni");
});

test("sotto i cinque avversari comuni il confronto non si dichiara", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const povere = await sql<{ comp: string; casa: string; fuori: string; comuni: string }[]>`
    with d as (select distinct team_id, competition_id, opponent_id from football.team_match_observations)
    select c.source_id::text as comp, ta.source_id::text as casa, tb.source_id::text as fuori,
           count(*)::text as comuni
    from d a
    join d b on b.competition_id = a.competition_id and b.team_id > a.team_id
            and b.opponent_id = a.opponent_id
    join football.competitions c on c.id = a.competition_id
    join football.teams ta on ta.id = a.team_id
    join football.teams tb on tb.id = b.team_id
    where a.opponent_id <> b.team_id and b.opponent_id <> a.team_id
    group by 1, 2, 3
    having count(*) between 1 and 4
    limit 1
  `;
  const q = povere[0];
  if (q === undefined) assert.fail("nessuna coppia sotto i cinque avversari: la soglia non e' piu' esercitata");
  const dati = await scontriComuni(Number(q.comp), Number(q.casa), Number(q.fuori));
  assert.equal(dati, null, `${q.comuni} avversari comuni non fanno un confronto`);
});
