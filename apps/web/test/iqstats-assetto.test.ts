// Prove dell'assetto in campo e delle fasce di gara.
//
// Le due frasi sono pure e si provano senza database. Gli invarianti delle query girano
// solo con `IQSTATS_PROJECTION_DATABASE_URL`.
//
// Quello che sorvegliano: una differenza dentro l'errore non diventa un assetto diverso,
// il carattere non si dichiara sotto tre gare, le sei fasce coprono la gara e le misure
// restano nella scala del campo.
import assert from "node:assert/strict";
import test from "node:test";

import { connessione } from "../src/server/iqstats/lettura.ts";
import {
  assettoDelConfronto,
  quandoSpingono,
  verdettoDelleFasce,
  verdettoDiAssetto,
  type FasciaDiGara,
} from "../src/server/iqstats/assetto.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

function fascia(band: number, casa: number, trasferta: number): FasciaDiGara {
  const totale = casa + trasferta;
  return {
    band,
    etichetta: ["1-15", "16-30", "31-45", "46-60", "61-75", "76-90"][band - 1],
    casa,
    trasferta,
    quotaCasa: totale === 0 ? 0.5 : casa / totale,
  };
}

// -------------------------------------------------------------------- assetto

test("una differenza dentro l'errore non diventa un assetto diverso", () => {
  // 42,0 contro 40,5: uno scarto di 1,5 con errori di 1,0 e 1,2 non si distingue.
  assert.equal(
    verdettoDiAssetto("Casa", "Fuori", 42.0, 40.5, 1.0, 1.2, 6, 6),
    "Le due squadre stanno in campo alla stessa altezza",
  );
});

test("uno scarto che supera i due errori si dichiara, e nel verso giusto", () => {
  assert.equal(
    verdettoDiAssetto("Casa", "Fuori", 46.0, 34.0, 1.0, 1.2, 6, 6),
    "Casa alza la linea, Fuori difende più basso",
  );
  assert.equal(
    verdettoDiAssetto("Casa", "Fuori", 34.0, 46.0, 1.0, 1.2, 6, 6),
    "Fuori alza la linea, Casa difende più basso",
  );
});

test("sotto tre gare l'assetto non si dichiara", () => {
  assert.equal(verdettoDiAssetto("Casa", "Fuori", 46.0, 34.0, 1.0, 1.2, 2, 6), null);
  assert.equal(verdettoDiAssetto("Casa", "Fuori", 46.0, 34.0, 1.0, 1.2, 6, 1), null);
});

test("senza errore misurabile non si dichiara un assetto", () => {
  assert.equal(verdettoDiAssetto("Casa", "Fuori", 46.0, 34.0, null, 1.2, 6, 6), null);
});

// --------------------------------------------------------------------- fasce

test("la frase nomina il tratto piu' produttivo di ciascuna", () => {
  const fasce = [
    fascia(1, 0.30, 0.10), fascia(2, 0.20, 0.12), fascia(3, 0.18, 0.15),
    fascia(4, 0.15, 0.20), fascia(5, 0.12, 0.28), fascia(6, 0.10, 0.35),
  ];
  assert.equal(
    verdettoDelleFasce("Casa", "Fuori", fasce, 6, 6),
    "Casa produce di più fra 1-15, Fuori fra 76-90",
  );
});

test("quando il picco e' lo stesso la frase non inventa una differenza", () => {
  const fasce = [fascia(1, 0.10, 0.10), fascia(6, 0.30, 0.35)];
  assert.equal(
    verdettoDelleFasce("Casa", "Fuori", fasce, 6, 6),
    "Le due squadre producono di più nello stesso tratto, 76-90",
  );
});

test("sotto tre gare le fasce non si interpretano", () => {
  assert.equal(verdettoDelleFasce("Casa", "Fuori", [fascia(1, 0.3, 0.1)], 2, 6), null);
});

// ---------------------------------------------------------------- invarianti

test("le misure restano nella scala del campo e le gare sono in stagione", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const righe = await sql<{
    casa: string; fuori: string; stagione: string; quando: string;
  }[]>`
    select th.source_id::text as casa, ta.source_id::text as fuori,
           s.source_id::text as stagione, m.kickoff_at::text as quando
    from football.matches m
    join football.teams th on th.id = m.home_team_id
    join football.teams ta on ta.id = m.away_team_id
    join football.seasons s on s.id = m.season_id
    where (select count(*) from football.team_match_shape h
             join football.matches p on p.id = h.match_id
             where h.team_id = m.home_team_id and p.season_id = m.season_id
               and h.kickoff_at < m.kickoff_at) >= 3
      and (select count(*) from football.team_match_shape h
             join football.matches p on p.id = h.match_id
             where h.team_id = m.away_team_id and p.season_id = m.season_id
               and h.kickoff_at < m.kickoff_at) >= 3
    order by m.kickoff_at desc
    limit 1
  `;
  const caso = righe[0];
  assert.ok(caso !== undefined, "nessuna gara con tre assetti per squadra in stagione");

  const assetto = await assettoDelConfronto(
    Number(caso.casa), Number(caso.fuori), Number(caso.stagione), caso.quando,
  );
  assert.ok(assetto !== null, "nessun assetto");
  assert.ok(assetto.gareCasa >= 3 && assetto.gareTrasferta >= 3);
  assert.notEqual(assetto.verdetto, null, "con tre gare il verdetto ci deve essere");
  const linea = assetto.righe.find((r) => r.chiave === "linea");
  assert.ok(linea !== undefined, "manca l'altezza della linea");
  for (const valore of [linea.casa, linea.trasferta]) {
    const n = Number(valore.replace(",", "."));
    assert.ok(n > 0 && n < 100, `altezza fuori scala: ${valore}`);
  }

  const fasce = await quandoSpingono(
    Number(caso.casa), Number(caso.fuori), Number(caso.stagione), caso.quando,
  );
  assert.ok(fasce !== null, "nessuna fascia");
  assert.ok(fasce.fasce.length > 0 && fasce.fasce.length <= 6);
  for (const f of fasce.fasce) {
    assert.ok(f.casa >= 0 && f.trasferta >= 0, "gol attesi negativi");
    assert.ok(f.quotaCasa >= 0 && f.quotaCasa <= 1, "quota fuori scala");
  }
  // Le bande sono in ordine e senza doppioni: una fascia due volte raddoppierebbe la gara.
  const numeri = fasce.fasce.map((f) => f.band);
  assert.deepEqual(numeri, [...numeri].sort((a, b) => a - b));
  assert.equal(new Set(numeri).size, numeri.length);
});

test("senza identificativi validi non esce un assetto inventato", opzioni, async () => {
  assert.equal(
    await assettoDelConfronto(999_999_999, 999_999_998, 999_999_997, new Date().toISOString()),
    null,
  );
  assert.equal(
    await quandoSpingono(999_999_999, 999_999_998, 999_999_997, new Date().toISOString()),
    null,
  );
});
