// Prove d'integrazione del metro di lega: girano solo con una connessione al livello dati.
//
// Senza `IQSTATS_PROJECTION_DATABASE_URL` si saltano invece di fallire, come `test:arbitri`.
//
// Quello che verificano non e' «il numero e' questo» — cambia a ogni passata — ma che gli
// invarianti reggano: la posizione dentro la scala, il campione sopra la soglia, e
// soprattutto **che la posizione sia quella vera**, ricontata sulla distribuzione invece
// che creduta sulla parola di `percent_rank()`.
import assert from "node:assert/strict";
import test from "node:test";

import { connessione } from "../src/server/iqstats/lettura.ts";
import { metroDiLega } from "../src/server/iqstats/team-metro.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

/** Una squadra e una stagione che hanno di sicuro il campione: si scelgono dai dati. */
async function unCaso(): Promise<{
  squadra: number;
  competizione: number;
  stagione: number;
  nome: string;
}> {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  // Il caso si sceglie con la stessa chiave che usa la pagina — competizione **e**
  // stagione — perche' la stagione da sola compare in piu' tornei.
  const righe = await sql<
    { squadra: string; competizione: string; stagione: string; nome: string }[]
  >`
    select t.source_id::text as squadra, c.source_id::text as competizione,
           s.source_id::text as stagione, t.name as nome
    from football.team_match_observations o
    join football.teams t on t.id = o.team_id
    join football.seasons s on s.id = o.season_id
    join football.competitions c on c.id = o.competition_id
    group by 1, 2, 3, 4
    having count(*) >= 10
    order by count(*) desc
    limit 1
  `;
  const riga = righe[0];
  assert.ok(riga !== undefined, "nessuna squadra con dieci gare osservate");
  return {
    squadra: Number(riga.squadra),
    competizione: Number(riga.competizione),
    stagione: Number(riga.stagione),
    nome: riga.nome,
  };
}

test("il metro porta i sette bersagli, con posizione dentro la scala", opzioni, async () => {
  const caso = await unCaso();
  const sql = connessione();
  assert.ok(sql !== null);
  const metro = await metroDiLega(caso.squadra, caso.competizione, caso.stagione);
  assert.ok(metro !== null, `nessun metro per ${caso.nome}`);

  assert.equal(
    metro.voci.length + metro.assenti.length, 7,
    "i sette bersagli devono essere tutti o misurati o dichiarati assenti",
  );
  assert.ok(metro.voci.length > 0, "nessun bersaglio misurato");
  assert.ok(metro.squadre >= 2, "un metro di una squadra sola non e' una posizione");
  assert.ok(metro.gare >= 5, `${metro.gare} gare, sotto il campione minimo dichiarato`);
  // **Il metro deve essere della competizione chiesta.** Lo stesso identificativo di
  // stagione della fonte compare in piu' tornei: filtrando per la sola stagione il modulo
  // ne pescava uno a caso, e il confronto avveniva fra campionati diversi senza dirlo.
  // Questa riga e' l'unica che se ne accorge.
  const atteso = await sql<{ nome: string }[]>`
    select name as nome from football.competitions
    where source_id = ${caso.competizione}::bigint
  `;
  assert.equal(
    metro.competizione, atteso[0]?.nome,
    "il metro non e' della competizione chiesta",
  );
  // Il nome della competizione e' vero: se fosse un segnaposto la pagina lo mostrerebbe
  // cosi' com'e', ed e' esattamente cio' che non deve succedere.
  assert.ok(
    !metro.competizione.includes("segnaposto"),
    `competizione senza nome vero: ${metro.competizione}`,
  );

  for (const voce of metro.voci) {
    assert.ok(voce.quota >= 0 && voce.quota <= 1, `${voce.nome}: quota ${voce.quota} fuori scala`);
    assert.ok(voce.media >= 0, `${voce.nome}: media negativa`);
    assert.ok(voce.mediaDiLega >= 0, `${voce.nome}: media di lega negativa`);
    assert.ok(voce.campione >= 5, `${voce.nome}: campione ${voce.campione} sotto la soglia`);
    assert.ok(
      voce.campione <= metro.gare,
      `${voce.nome}: campione ${voce.campione} sopra le ${metro.gare} gare osservate`,
    );
  }

  // **Un assente dev'essere assente davvero.** Una chiave sbagliata fa sparire un bersaglio
  // che il database ha: `n_inPorta` tornava come `n_inporta` e «Tiri in porta» finiva fra gli
  // assenti con ventiquattro gare buone. Si ricontano le righe non nulle di ogni assente.
  const colonne: Record<string, string> = {
    Tiri: "total_shots",
    "Tiri in porta": "shots_on_target",
    Corner: "corner_kicks",
    Falli: "fouls",
    "Cartellini gialli": "yellow_cards",
    Fuorigioco: "offsides",
    Parate: "goalkeeper_saves",
  };
  for (const nome of metro.assenti) {
    const colonna = colonne[nome];
    assert.ok(colonna !== undefined, `bersaglio sconosciuto fra gli assenti: ${nome}`);
    const quante = await sql<{ n: string }[]>`
      select count(o.${sql.unsafe(colonna)})::text as n
      from football.team_match_observations o
      join football.teams t on t.id = o.team_id
      join football.seasons s on s.id = o.season_id
      join football.competitions c on c.id = o.competition_id
      where t.source_id = ${caso.squadra}::bigint
        and c.source_id = ${caso.competizione}::bigint
        and s.source_id = ${caso.stagione}::bigint
    `;
    assert.ok(
      Number(quante[0]?.n) < 5,
      `${nome} e' dichiarato assente ma il database ne ha ${quante[0]?.n} gare`,
    );
  }

  // **Il campione dichiarato dev'essere quello che regge la media.** `avg()` salta i nulli:
  // sul Corinthians 66 gare osservate portano 38 pannelli, e dichiarare 66 direbbe che il
  // numero e' piu' solido di quanto sia. Si ricontano i falli non nulli.
  const conteggio = await sql<{ n: string; righe: string }[]>`
    select count(o.fouls)::text as n, count(*)::text as righe
    from football.team_match_observations o
    join football.teams t on t.id = o.team_id
    join football.seasons s on s.id = o.season_id
    join football.competitions c on c.id = o.competition_id
    where t.source_id = ${caso.squadra}::bigint
      and c.source_id = ${caso.competizione}::bigint
      and s.source_id = ${caso.stagione}::bigint
  `;
  const falli = metro.voci.find((v) => v.nome === "Falli");
  if (falli !== undefined) {
    assert.equal(
      falli.campione, Number(conteggio[0]?.n),
      "il campione dei falli non e' il numero di gare che portano quel dato",
    );
  }
});

test("la posizione dichiarata e' quella vera, ricontata", opzioni, async () => {
  const caso = await unCaso();
  const metro = await metroDiLega(caso.squadra, caso.competizione, caso.stagione);
  assert.ok(metro !== null);

  const sql = connessione();
  assert.ok(sql !== null);

  // Si ricostruisce la distribuzione a mano e si conta quante squadre stanno sotto: se
  // `percent_rank()` fosse sulla partizione sbagliata — per esempio senza la stagione — il
  // conto non tornerebbe, e questo e' l'errore che nessuno vedrebbe guardando la pagina.
  const distribuzione = await sql<{ team_id: string; falli: string | null }[]>`
    select o.team_id::text, avg(o.fouls)::text as falli
    from football.team_match_observations o
    join football.seasons s on s.id = o.season_id
    join football.competitions c on c.id = o.competition_id
    where c.source_id = ${caso.competizione}::bigint
      and s.source_id = ${caso.stagione}::bigint
    group by 1
    having count(*) >= 5
  `;
  assert.equal(
    distribuzione.length, metro.squadre,
    "il metro dichiara un numero di squadre diverso da quelle che compongono la distribuzione",
  );

  const voceFalli = metro.voci.find((v) => v.nome === "Falli");
  assert.ok(voceFalli !== undefined, "i falli non sono fra i bersagli");
  // Una squadra senza falli osservati ha media nulla, e `Number(null)` vale zero: contarla
  // fra quelle «sotto» sarebbe far diventare zero un'assenza, che e' l'errore che tutto il
  // resto di questo livello dati evita. La prima stesura di questo test lo faceva.
  const sotto = distribuzione.filter(
    (r) => r.falli !== null && Number(r.falli) < voceFalli.media,
  ).length;
  const dichiarate = Math.round(voceFalli.quota * (metro.squadre - 1));
  assert.equal(
    dichiarate, sotto,
    `il metro dice di superarne ${dichiarate}, la distribuzione ne conta ${sotto}`,
  );
});
