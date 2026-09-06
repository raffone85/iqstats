// La base di lega e l'ordine che ne discende.
//
// Le prime due prove sono pure e girano sempre; le ultime quattro chiedono al livello dati
// e si saltano senza connessione, come `test:lati`.
import assert from "node:assert/strict";
import test from "node:test";

import { baseDiLega, baseDiSquadra, chiaveDi } from "../src/server/iqstats/base-di-lega.ts";
import { connessione } from "../src/server/iqstats/lettura.ts";
import { ordinaLetture, chiaveDiLinea } from "../src/server/iqstats/projection/letture-forti.ts";
import type { LetturaForte } from "../src/server/iqstats/projection/letture-forti.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

function linea(
  bersaglio: string, soglia: number, probabilita: number, verso: "Over" | "Under" = "Over",
): LetturaForte {
  return {
    bersaglio, lato: "totale", soglia, verso, probabilita,
    decisione: Math.abs(probabilita - 0.5),
    base: null, gareDiBase: null, squadre: [], affidabilita: 100, righeDiProva: 2000,
    sorpresa: 0, forza: 0,
  };
}

test("la base resta accanto alla lettura, sopra e sotto", () => {
  // **Questa prova e' stata riscritta il 6 settembre 2026, non cancellata.** Verificava il
  // criterio per forza: fra «Under 5,5 fuorigioco al 70%» in una lega dove succede l'87% e
  // una lettura al 63% che si scosta davvero, vinceva la seconda. Da quel giorno l'ordine e'
  // per probabilita' dentro la fascia tarata, perche' su 1.200 gare chiuse il criterio per
  // forza portava in cima letture che rendevano 63,3% contro il 65,1% promesso. Quello che
  // resta vero, e che questa prova difende, e' che **la base di lega viaggia con la lettura**
  // in tutti e due i versi: senza, un 70% dove succede l'87% si leggerebbe come una notizia.
  const ovvia = linea("offsides", 5.5, 0.70, "Under");
  const inattesa = linea("total_shots", 10.5, 0.63);
  const basi = new Map([
    [chiaveDiLinea(ovvia), { quota: 87, gare: 235 }],
    [chiaveDiLinea(inattesa), { quota: 45, gare: 235 }],
  ]);

  const conBasi = ordinaLetture([ovvia, inattesa], [], basi);
  assert.equal(conBasi.letture[0]?.bersaglio, "offsides", "l'ordine e' per probabilita'");
  assert.equal(conBasi.letture[0]?.base, 87, "e porta con se' quanto e' normale in quella lega");
  assert.equal(conBasi.letture[1]?.base, 45);
  assert.ok(
    (conBasi.letture[0]?.probabilita ?? 1) * 100 < (conBasi.letture[0]?.base ?? 0),
    "la prima sta sotto la sua base, ed e' proprio l'informazione da leggere",
  );
  assert.ok(
    (conBasi.letture[1]?.probabilita ?? 0) * 100 > (conBasi.letture[1]?.base ?? 100),
    "la seconda sta sopra la sua",
  );
});

test("chi non ha una base lo dichiara, invece di fingerla", () => {
  const a = linea("corner_kicks", 7.5, 0.80);
  const b = linea("fouls", 25.5, 0.60);
  const solaUna = new Map([[chiaveDiLinea(b), { quota: 10, gare: 200 }]]);
  const r = ordinaLetture([a, b], [], solaUna);
  // L'ordine e' per probabilita': l'80% davanti al 60%, e la base non lo cambia.
  assert.equal(r.letture[0]?.bersaglio, "corner_kicks");
  assert.equal(r.letture[0]?.base, null, "chi non ha base lo dichiara invece di fingerla");
  assert.equal(r.letture[1]?.base, 10);
});

test("la base e' quella misurata sulle nostre righe, ricontata a mano", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  // Un torneo con abbastanza gare: si sceglie dai dati, non si scrive a mano.
  const tornei = await sql<{ comp: string; stag: string; gare: string }[]>`
    select c.source_id::text as comp, s.source_id::text as stag,
           count(distinct o.match_id)::text as gare
    from football.team_match_observations o
    join football.competitions c on c.id = o.competition_id
    join football.seasons s on s.id = o.season_id
    where o.offsides is not null
    group by 1, 2
    order by count(distinct o.match_id) desc
    limit 1
  `;
  const t = tornei[0];
  assert.ok(t !== undefined, "nessun torneo con i fuorigioco");

  const richiesta = { target: "offsides", lato: "totale" as const, soglia: 5.5, verso: "Under" as const };
  const mappa = await baseDiLega(Number(t.comp), Number(t.stag), [richiesta]);
  assert.ok(mappa !== null, "nessuna base");
  const base = mappa.get(chiaveDi(richiesta));
  assert.ok(base !== undefined, "la base della linea chiesta non c'e'");

  const riconto = await sql<{ quota: string; gare: string }[]>`
    with g as (
      select o.match_id, sum(o.offsides) as v
      from football.team_match_observations o
      join football.competitions c on c.id = o.competition_id
      join football.seasons s on s.id = o.season_id
      where c.source_id = ${Number(t.comp)}::bigint and s.source_id = ${Number(t.stag)}::bigint
      group by 1 having count(*) = 2
    )
    select (100 * avg((v < 5.5)::int) filter (where v is not null))::text as quota,
           (count(*) filter (where v is not null))::text as gare
    from g
  `;
  assert.ok(Math.abs(base.quota - Number(riconto[0]?.quota)) < 1e-9, "la quota non torna");
  assert.equal(base.gare, Number(riconto[0]?.gare), "il campione non torna");
});

test("sotto le trenta gare la base non si dichiara", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const povero = await sql<{ comp: string; stag: string; gare: string }[]>`
    select c.source_id::text as comp, s.source_id::text as stag,
           count(distinct o.match_id)::text as gare
    from football.team_match_observations o
    join football.competitions c on c.id = o.competition_id
    join football.seasons s on s.id = o.season_id
    group by 1, 2
    having count(distinct o.match_id) between 3 and 25
    order by count(distinct o.match_id) desc
    limit 1
  `;
  const t = povero[0];
  if (t === undefined) {
    assert.fail("nessun torneo sotto le trenta gare: la soglia non e' piu' esercitata");
  }
  const richiesta = { target: "corner_kicks", lato: "totale" as const, soglia: 8.5, verso: "Over" as const };
  const mappa = await baseDiLega(Number(t.comp), Number(t.stag), [richiesta]);
  assert.ok(mappa !== null);
  assert.equal(mappa.get(chiaveDi(richiesta)), undefined, `${t.gare} gare non fanno una base`);
});

test("la base di squadra conta le sue gare da quel lato, ricontata a mano", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  // La squadra con piu' gare in casa: si sceglie dai dati, non si scrive a mano.
  const scelte = await sql<{ squadra: string; comp: string; gare: string }[]>`
    select t.source_id::text as squadra, c.source_id::text as comp, count(*)::text as gare
    from football.team_match_observations o
    join football.teams t on t.id = o.team_id
    join football.competitions c on c.id = o.competition_id
    where o.side = 'home' and o.corner_kicks is not null
    group by 1, 2
    order by count(*) desc
    limit 1
  `;
  const q = scelte[0];
  assert.ok(q !== undefined, "nessuna squadra con i corner");

  // Le due semantiche in una prova sola: il valore proprio e il totale di gara.
  const propria = { target: "corner_kicks", lato: "casa" as const, soglia: 4.5, verso: "Over" as const };
  const totale = { target: "corner_kicks", lato: "totale" as const, soglia: 9.5, verso: "Over" as const };
  const mappa = await baseDiSquadra(Number(q.comp), Number(q.squadra), "home", [propria, totale]);
  assert.ok(mappa !== null, "nessuna base di squadra");

  const riconto = await sql<{ qp: string; np: string; qt: string; nt: string }[]>`
    with sq as (select id from football.teams where source_id = ${Number(q.squadra)}::bigint limit 1),
    mie as (
      select o.match_id from football.team_match_observations o
      join football.competitions c on c.id = o.competition_id
      where c.source_id = ${Number(q.comp)}::bigint
        and o.team_id = (select id from sq) and o.side = 'home'
    ),
    g as (
      select o.match_id,
             max(o.corner_kicks) filter (where o.side = 'home') as vp,
             sum(o.corner_kicks) as vt
      from football.team_match_observations o
      where o.match_id in (select match_id from mie)
      group by 1 having count(*) = 2
    )
    select (100 * avg((vp > 4.5)::int) filter (where vp is not null))::text as qp,
           (count(*) filter (where vp is not null))::text as np,
           (100 * avg((vt > 9.5)::int) filter (where vt is not null))::text as qt,
           (count(*) filter (where vt is not null))::text as nt
    from g
  `;
  const r = riconto[0];
  assert.ok(r !== undefined, "il riconto non ha risposto");
  const p = mappa.get(chiaveDi(propria));
  const t = mappa.get(chiaveDi(totale));
  assert.ok(p !== undefined && t !== undefined, `${q.gare} gare in casa e nessuna base`);
  assert.ok(Math.abs(p.quota - Number(r.qp)) < 1e-9, "la quota propria non torna");
  assert.equal(p.gare, Number(r.np), "il campione proprio non torna");
  assert.ok(Math.abs(t.quota - Number(r.qt)) < 1e-9, "la quota di totale non torna");
  assert.equal(t.gare, Number(r.nt), "il campione del totale non torna");
});

test("sotto le quindici gare la base di squadra non si dichiara", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const povere = await sql<{ squadra: string; comp: string; gare: string }[]>`
    select t.source_id::text as squadra, c.source_id::text as comp, count(*)::text as gare
    from football.team_match_observations o
    join football.teams t on t.id = o.team_id
    join football.competitions c on c.id = o.competition_id
    where o.side = 'home'
    group by 1, 2
    having count(*) between 3 and 12
    order by count(*) desc
    limit 1
  `;
  const q = povere[0];
  if (q === undefined) assert.fail("nessuna squadra sotto le quindici gare: la soglia non e' piu' esercitata");
  const richiesta = { target: "corner_kicks", lato: "casa" as const, soglia: 4.5, verso: "Over" as const };
  const mappa = await baseDiSquadra(Number(q.comp), Number(q.squadra), "home", [richiesta]);
  assert.ok(mappa !== null);
  assert.equal(mappa.get(chiaveDi(richiesta)), undefined, `${q.gare} gare non fanno una base`);
});
