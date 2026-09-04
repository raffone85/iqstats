// Prove delle ultime cinque dal lato che si gioca.
//
// Il rapporto scritto e' puro e si prova senza database. Gli invarianti della query
// girano solo con `IQSTATS_PROJECTION_DATABASE_URL`, come `test:lati`.
//
// Quello che sorvegliano: il lato chiesto e' davvero quello letto, la finestra non
// fa entrare la gara che si sta leggendo, una metrica assente non diventa zero, e il
// testo non promette niente su questa partita.
import assert from "node:assert/strict";
import test from "node:test";

import { connessione } from "../src/server/iqstats/lettura.ts";
import {
  rapportoDelConfronto,
  ultimeCinque,
  type CinqueDiLato,
  type GaraRecente,
} from "../src/server/iqstats/ultime-cinque.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

function gara(parziale: Partial<GaraRecente>): GaraRecente {
  return {
    quando: "2026-08-01T18:00:00Z",
    avversario: "Avversaria",
    golFatti: 1,
    golSubiti: 1,
    xgFatti: 1.2,
    xgSubiti: 1.1,
    tiriFatti: 12,
    tiriSubiti: 10,
    portaFatti: 4,
    portaSubiti: 3,
    diQuestaStagione: true,
    ...parziale,
  };
}

function serie(nome: string, lato: "casa" | "trasferta", gare: GaraRecente[]): CinqueDiLato {
  return {
    nome,
    lato,
    gare,
    diQuestaStagione: gare.filter((g) => g.diQuestaStagione).length,
    totali: {
      gol: { fatti: gare.reduce((t, g) => t + (g.golFatti ?? 0), 0),
        subiti: gare.reduce((t, g) => t + (g.golSubiti ?? 0), 0),
        gare: gare.filter((g) => g.golFatti !== null).length },
      xg: { fatti: gare.reduce((t, g) => t + (g.xgFatti ?? 0), 0),
        subiti: gare.reduce((t, g) => t + (g.xgSubiti ?? 0), 0),
        gare: gare.filter((g) => g.xgFatti !== null).length },
      tiri: { fatti: gare.reduce((t, g) => t + (g.tiriFatti ?? 0), 0),
        subiti: gare.reduce((t, g) => t + (g.tiriSubiti ?? 0), 0),
        gare: gare.filter((g) => g.tiriFatti !== null).length },
      porta: null,
    },
  };
}

// -------------------------------------------------------------- il rapporto

test("il rapporto dice i gol dei due lati con il loro campione", () => {
  const casa = serie("Casa", "casa", [gara({ golFatti: 3, golSubiti: 0 }), gara({ golFatti: 1, golSubiti: 2 })]);
  const fuori = serie("Fuori", "trasferta", [gara({ golFatti: 0, golSubiti: 1 })]);
  const frasi = rapportoDelConfronto(casa, fuori, casa.totali);
  assert.ok(frasi[0].includes("Casa nelle ultime 2 in casa ha fatto 4 gol"));
  assert.ok(frasi[1].includes("Fuori nelle ultime 1 in trasferta ne ha fatti 0"));
});

test("i gol attesi si confrontano con i gol, e il verso e' quello giusto", () => {
  // Quattro gol con 1,2 attesi a gara su due gare: 4 contro 2,4, sopra il gioco.
  const casa = serie("Casa", "casa", [gara({ golFatti: 3 }), gara({ golFatti: 1 })]);
  const fuori = serie("Fuori", "trasferta", [gara({ golFatti: 0 })]);
  const frasi = rapportoDelConfronto(casa, fuori, casa.totali);
  assert.ok(frasi.some((f) => f.includes("più di quanto il gioco diceva")), frasi.join(" | "));
});

test("il rapporto non promette niente su questa partita", () => {
  const casa = serie("Casa", "casa", [gara({})]);
  const fuori = serie("Fuori", "trasferta", [gara({})]);
  const frasi = rapportoDelConfronto(casa, fuori, casa.totali);
  const testo = frasi.join(" ").toLowerCase();
  for (const parola of ["probabil", "previs", "consigl", "quota", "over ", "under "]) {
    assert.ok(!testo.includes(parola) || testo.includes("non una previsione"),
      `il testo usa «${parola}»: ${testo}`);
  }
  assert.ok(testo.includes("non una previsione"));
});

test("una metrica assente non diventa zero e la frase non si scrive", () => {
  const senzaTiri = serie("Casa", "casa", [gara({ tiriFatti: null, tiriSubiti: null })]);
  const vuota: CinqueDiLato = { ...senzaTiri, totali: { ...senzaTiri.totali, tiri: null } };
  const fuori = serie("Fuori", "trasferta", [gara({})]);
  const frasi = rapportoDelConfronto(vuota, fuori, vuota.totali);
  assert.ok(!frasi.some((f) => f.startsWith("Ai tiri")), frasi.join(" | "));
});

// ------------------------------------------------------------ gli invarianti

test("il lato letto e' quello chiesto, e la gara non entra in se stessa", opzioni, async () => {
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
    join football.team_match_observations o on o.match_id = m.id
    where (select count(*) from football.team_match_observations x
             where x.team_id = m.home_team_id and x.side = 'home'
               and x.kickoff_at < m.kickoff_at) >= 5
    order by m.kickoff_at desc
    limit 1
  `;
  const caso = righe[0];
  assert.ok(caso !== undefined, "nessuna gara con cinque precedenti in casa");

  const lette = await ultimeCinque(
    Number(caso.casa), Number(caso.fuori), Number(caso.lega), Number(caso.stagione), caso.quando,
  );
  assert.ok(lette !== null, "nessuna lettura");
  assert.equal(lette.casa.nome, caso.nome);
  assert.equal(lette.casa.lato, "casa");
  assert.equal(lette.trasferta.lato, "trasferta");
  assert.ok(lette.casa.gare.length <= 5 && lette.casa.gare.length > 0);
  for (const g of lette.casa.gare) {
    assert.ok(new Date(g.quando) < new Date(caso.quando), "una gara successiva e' entrata");
    assert.ok(g.avversario.length > 0, "un avversario senza nome");
  }
  // Il totale e' la somma delle gare che portano la metrica, non delle cinque a prescindere.
  const gol = lette.casa.totali.gol;
  assert.ok(gol !== null);
  assert.equal(
    gol.fatti,
    lette.casa.gare.reduce((t, g) => t + (g.golFatti ?? 0), 0),
  );
  assert.ok(gol.gare <= lette.casa.gare.length);
  assert.ok(lette.rapporto.length >= 2, "il rapporto e' vuoto");
});

test("senza identificativi validi non esce una serie inventata", opzioni, async () => {
  assert.equal(
    await ultimeCinque(999_999_999, 999_999_998, 999_999_997, 999_999_996, new Date().toISOString()),
    null,
  );
});
