// Prove d'integrazione delle medie per lato: girano solo con una connessione al livello dati.
//
// Senza `IQSTATS_PROJECTION_DATABASE_URL` si saltano invece di fallire, come `test:team-metro`.
//
// Quello che verificano non e' «il numero e' questo» — cambia a ogni passata — ma gli
// invarianti che, se saltassero, produrrebbero una pagina sbagliata senza che si veda:
// prodotto e concesso sullo stesso campione, il concesso che e' davvero dell'avversario, e
// il lato che e' davvero quello chiesto.
import assert from "node:assert/strict";
import test from "node:test";

import { connessione } from "../src/server/iqstats/lettura.ts";
import { medieDiLato } from "../src/server/iqstats/lati.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

/** Una squadra con abbastanza gare in casa perche' il campione regga: si sceglie dai dati. */
async function unCaso(): Promise<{
  squadra: number;
  competizione: number;
  stagione: number;
  nome: string;
}> {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const righe = await sql<
    { squadra: string; competizione: string; stagione: string; nome: string }[]
  >`
    select t.source_id::text as squadra, c.source_id::text as competizione,
           s.source_id::text as stagione, t.name as nome
    from football.team_match_observations o
    join football.teams t on t.id = o.team_id
    join football.seasons s on s.id = o.season_id
    join football.competitions c on c.id = o.competition_id
    where o.side = 'home'
    group by 1, 2, 3, 4
    having count(*) >= 10
    order by count(*) desc
    limit 1
  `;
  const riga = righe[0];
  assert.ok(riga !== undefined, "nessuna squadra con dieci gare in casa");
  return {
    squadra: Number(riga.squadra),
    competizione: Number(riga.competizione),
    stagione: Number(riga.stagione),
    nome: riga.nome,
  };
}

test("prodotto e concesso poggiano sulle stesse gare", opzioni, async () => {
  const caso = await unCaso();
  const lato = await medieDiLato(caso.squadra, caso.competizione, caso.stagione, "home");
  assert.ok(lato !== null, `nessun lato per ${caso.nome}`);

  assert.equal(lato.lato, "home");
  assert.ok(lato.voci.length > 0, "nessuna metrica misurata");
  assert.equal(
    lato.voci.length + lato.assenti.length, 19,
    "le diciannove metriche devono essere tutte o misurate o dichiarate assenti",
  );

  for (const voce of lato.voci) {
    assert.ok(voce.prodotto >= 0, `${voce.nome}: prodotto negativo`);
    assert.ok(voce.concesso >= 0, `${voce.nome}: concesso negativo`);
    assert.ok(voce.campione >= 5, `${voce.nome}: campione ${voce.campione} sotto la soglia`);
    // **Il campione non puo' superare le gare giocate da questo lato.** Se l'innesto
    // moltiplicasse le righe — per esempio unendo una gara a se stessa — questo numero
    // salirebbe oltre le gare, ed e' l'unico posto in cui si vedrebbe.
    assert.ok(
      voce.campione <= lato.gare,
      `${voce.nome}: campione ${voce.campione} sopra le ${lato.gare} gare del lato`,
    );
  }
});

test("il concesso e' davvero quello dell'avversario, ricontato", opzioni, async () => {
  const caso = await unCaso();
  const lato = await medieDiLato(caso.squadra, caso.competizione, caso.stagione, "home");
  assert.ok(lato !== null);
  const sql = connessione();
  assert.ok(sql !== null);

  // Si ricostruiscono a mano le gare in casa con i falli su **entrambi** i lati, e si
  // rifanno le due medie. Se l'innesto prendesse la riga sbagliata — la propria invece
  // dell'avversaria — prodotto e concesso uscirebbero uguali e nessuno se ne accorgerebbe
  // guardando la pagina.
  const gare = await sql<{ miei: string; loro: string }[]>`
    select o.fouls::text as miei, a.fouls::text as loro
    from football.team_match_observations o
    join football.team_match_observations a
      on a.match_id = o.match_id and a.side <> o.side
    join football.teams t on t.id = o.team_id
    join football.competitions c on c.id = o.competition_id
    join football.seasons s on s.id = o.season_id
    where t.source_id = ${caso.squadra}::bigint
      and c.source_id = ${caso.competizione}::bigint
      and s.source_id = ${caso.stagione}::bigint
      and o.side = 'home'
      and o.fouls is not null and a.fouls is not null
  `;

  const falli = lato.voci.find((v) => v.chiave === "falli");
  if (falli === undefined) {
    assert.ok(gare.length < 5, `i falli sono assenti ma il database ne ha ${gare.length} gare`);
    return;
  }

  assert.equal(falli.campione, gare.length, "il campione dei falli non e' quello vero");
  const mediaMiei = gare.reduce((t, g) => t + Number(g.miei), 0) / gare.length;
  const mediaLoro = gare.reduce((t, g) => t + Number(g.loro), 0) / gare.length;
  assert.ok(
    Math.abs(falli.prodotto - mediaMiei) < 1e-6,
    `prodotto ${falli.prodotto}, ricontato ${mediaMiei}`,
  );
  assert.ok(
    Math.abs(falli.concesso - mediaLoro) < 1e-6,
    `concesso ${falli.concesso}, ricontato ${mediaLoro}`,
  );
});

test("sotto il campione minimo non si dichiara niente", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null);

  // Un caso povero si cerca nei dati invece di scriverlo a mano: gare in casa ce ne sono,
  // ma le colonne le porta quasi nessuna. Senza la soglia il modulo pubblicherebbe una
  // media costruita su una partita, che e' il difetto misurato nelle schermate di
  // riferimento e la ragione per cui la soglia esiste.
  const righe = await sql<
    { squadra: string; competizione: string; stagione: string; nome: string; con: string }[]
  >`
    select t.source_id::text as squadra, c.source_id::text as competizione,
           s.source_id::text as stagione, t.name as nome, count(o.fouls)::text as con
    from football.team_match_observations o
    join football.teams t on t.id = o.team_id
    join football.competitions c on c.id = o.competition_id
    join football.seasons s on s.id = o.season_id
    where o.side = 'home'
    group by 1, 2, 3, 4
    having count(*) >= 6 and max(o.fouls) is not null and count(o.fouls) < 5
    order by count(*) desc
    limit 1
  `;
  const caso = righe[0];
  if (caso === undefined) {
    // Se un giorno ogni squadra avesse il campione pieno, questa prova non avrebbe piu' un
    // caso da esercitare: e' un fatto sui dati, e va detto invece che passare in silenzio.
    assert.fail("nessuna squadra sotto il campione minimo: la soglia non e' piu' esercitata");
  }

  const lato = await medieDiLato(
    Number(caso.squadra), Number(caso.competizione), Number(caso.stagione), "home",
  );
  assert.ok(lato !== null, `nessun lato per ${caso.nome}`);

  // **Le colonne non si riempiono insieme, e la prima stesura di questa prova lo ignorava.**
  // Kashiwa Reysol ha nove gare in casa: **una** porta i falli e **nove** portano i gialli.
  // Pretendere `null` sarebbe stato pretendere che una squadra povera di una colonna sia
  // povera di tutte. Quello che conta e' un altro: la metrica scarsa finisce fra le assenti,
  // e nessuna delle medie pubblicate poggia su meno di cinque gare.
  assert.ok(
    lato.assenti.includes("Falli"),
    `${caso.nome} ha ${caso.con} gare con i falli e il modulo li pubblica lo stesso`,
  );
  for (const voce of lato.voci) {
    assert.ok(
      voce.campione >= 5,
      `${voce.nome}: media pubblicata su ${voce.campione} gare, sotto la soglia`,
    );
  }
});

test("i due lati di una gara si riempiono insieme, o la guardia serve davvero", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null);

  // **Perche' questa prova esiste.** Il modulo prende una metrica solo se entrambi i lati
  // la portano. Oggi quella guardia non cambia un solo numero, perche' le colonne si
  // riempiono per gara intera: misurato, **zero gare su 10.673** hanno il dato da una parte
  // sola. Il guasto simulato che toglie la guardia quindi non fa arrossire nulla, e un
  // controllo che non sa fallire non e' una verifica.
  //
  // Questa riga sorveglia l'invariante invece della guardia: il giorno in cui il livello
  // dati portasse una gara a meta', diventa rossa qui, e da quel momento la guardia e'
  // esercitabile davvero.
  const righe = await sql<{ meta: string; righe_strane: string }[]>`
    with g as (
      select match_id, count(fouls) as falli, count(ball_possession) as possesso,
             count(*) as righe
      from football.team_match_observations
      group by 1
    )
    select count(*) filter (where falli = 1 or possesso = 1)::text as meta,
           count(*) filter (where righe <> 2)::text as righe_strane
    from g
  `;
  assert.equal(
    righe[0]?.righe_strane, "0",
    "una gara non porta due righe: il concesso non e' piu' definito come qui si assume",
  );
  assert.equal(
    righe[0]?.meta, "0",
    "esistono gare con il dato da un lato solo: la guardia sui due lati ora morde, "
      + "e il guasto che la toglie deve far fallire la prova sul concesso",
  );
});

test("il lato chiesto e' quello letto, e i due lati sono gare diverse", opzioni, async () => {
  const caso = await unCaso();
  const sql = connessione();
  assert.ok(sql !== null);

  const casa = await medieDiLato(caso.squadra, caso.competizione, caso.stagione, "home");
  const fuori = await medieDiLato(caso.squadra, caso.competizione, caso.stagione, "away");
  assert.ok(casa !== null, "nessun lato casa");

  // **Le gare del lato sono quelle del lato.** Senza il filtro su `o.side` il modulo
  // leggerebbe tutte le gare e chiamerebbe «in casa» la media complessiva: e' esattamente
  // l'errore gia' trovato in pagina sull'arbitro, dove l'etichetta contraddiceva il numero.
  const conta = await sql<{ n: string }[]>`
    select count(*)::text as n
    from football.team_match_observations o
    join football.teams t on t.id = o.team_id
    join football.competitions c on c.id = o.competition_id
    join football.seasons s on s.id = o.season_id
    where t.source_id = ${caso.squadra}::bigint
      and c.source_id = ${caso.competizione}::bigint
      and s.source_id = ${caso.stagione}::bigint
      and o.side = 'home'
  `;
  assert.equal(casa.gare, Number(conta[0]?.n), "le gare dichiarate non sono quelle in casa");

  if (fuori !== null) {
    assert.equal(fuori.lato, "away");
    // Due lati che portano lo stesso numero di gare **e** gli stessi identici falli
    // sarebbero il segno che il filtro non morde. Il caso e' scelto con almeno dieci gare
    // in casa, quindi una coincidenza esatta su entrambi non e' plausibile.
    const falliCasa = casa.voci.find((v) => v.chiave === "falli");
    const falliFuori = fuori.voci.find((v) => v.chiave === "falli");
    if (falliCasa !== undefined && falliFuori !== undefined) {
      assert.ok(
        casa.gare !== fuori.gare || falliCasa.prodotto !== falliFuori.prodotto,
        "casa e trasferta danno gare e falli identici: il filtro sul lato non morde",
      );
    }
  }
});
