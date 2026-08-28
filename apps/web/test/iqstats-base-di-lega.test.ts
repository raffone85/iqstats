// La base di lega e l'ordine che ne discende.
//
// Le prime due prove sono pure e girano sempre; le ultime due chiedono al livello dati e si
// saltano senza connessione, come `test:lati`.
import assert from "node:assert/strict";
import test from "node:test";

import { baseDiLega, chiaveDi } from "../src/server/iqstats/base-di-lega.ts";
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
    base: null, gareDiBase: null, affidabilita: 100, righeDiProva: 2000,
    sorpresa: 0, forza: 0,
  };
}

test("una lettura piu' alta ma normale perde contro una piu' bassa ma inattesa", () => {
  // Il difetto che ha fatto cambiare il criterio: «Under 5,5 fuorigioco al 70%» stava in
  // cima, ma in quella lega succede l'87% delle volte. Al 70% il modello sta dicendo che
  // succedera' **meno** del solito, e la vecchia forza - distanza dal cinquanta - la
  // metteva davanti a una lettura al 63% che invece si scosta davvero.
  const ovvia = linea("offsides", 5.5, 0.70, "Under");
  const inattesa = linea("total_shots", 10.5, 0.63);
  const basi = new Map([
    [chiaveDiLinea(ovvia), { quota: 87, gare: 235 }],
    [chiaveDiLinea(inattesa), { quota: 45, gare: 235 }],
  ]);

  const senzaBasi = ordinaLetture([ovvia, inattesa], [], null);
  assert.equal(senzaBasi.letture[0]?.bersaglio, "offsides", "col vecchio criterio vinceva la piu' decisa");

  const conBasi = ordinaLetture([ovvia, inattesa], [], basi);
  assert.equal(conBasi.letture[0]?.bersaglio, "total_shots", "ora vince quella che sorprende");
  assert.equal(conBasi.letture[0]?.base, 45);
  // La lettura sotto la base non sparisce: si mostra col suo numero, che si legge da solo.
  assert.equal(conBasi.letture[1]?.base, 87);
  assert.ok(
    (conBasi.letture[1]?.probabilita ?? 1) * 100 < (conBasi.letture[1]?.base ?? 0),
    "e resta sotto la base, che e' proprio l'informazione",
  );
});

test("senza base il riferimento resta cinquanta, cioe' il vecchio criterio", () => {
  const a = linea("corner_kicks", 7.5, 0.80);
  const b = linea("fouls", 25.5, 0.60);
  const solaUna = new Map([[chiaveDiLinea(b), { quota: 10, gare: 200 }]]);
  const r = ordinaLetture([a, b], [], solaUna);
  // `b` si scosta di 50 punti dalla sua base, `a` di 30 dal cinquanta di riserva.
  assert.equal(r.letture[0]?.bersaglio, "fouls");
  assert.equal(r.letture[1]?.base, null, "e chi non ha base lo dichiara invece di fingerla");
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
