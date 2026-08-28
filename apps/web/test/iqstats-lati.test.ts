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
    lato.voci.length + lato.assenti.length, 23,
    "le ventitre metriche devono essere tutte o misurate o dichiarate assenti",
  );

  for (const voce of lato.voci) {
    assert.ok(voce.prodotto.media >= 0, `${voce.nome}: prodotto negativo`);
    assert.ok(voce.concesso.media >= 0, `${voce.nome}: concesso negativo`);
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
    Math.abs(falli.prodotto.media - mediaMiei) < 1e-6,
    `prodotto ${falli.prodotto.media}, ricontato ${mediaMiei}`,
  );
  assert.ok(
    Math.abs(falli.concesso.media - mediaLoro) < 1e-6,
    `concesso ${falli.concesso.media}, ricontato ${mediaLoro}`,
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

test("le due guardie che oggi non mordono restano sorvegliate", opzioni, async () => {
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

  // **La seconda guardia cieca: il campione minimo nella lettura.** Il modulo scarta una
  // voce sotto le cinque gare, ma oggi quel controllo non tocca mai nulla, perche' nessuna
  // squadra sta nel mezzo: o la metrica non ce l'ha affatto, o ce l'ha su almeno cinque
  // gare, e nel primo caso a escluderla e' gia' l'assenza del metro. Misurato: **zero**
  // squadre con un campione fra uno e quattro in un torneo che un metro ce l'ha.
  const mezzo = await sql<{ n: string }[]>`
    with q as (
      select o.competition_id, o.season_id, o.team_id,
             count(*) filter (
               where o.fouls is not null and a.fouls is not null
             ) as campione
      from football.team_match_observations o
      join football.team_match_observations a
        on a.match_id = o.match_id and a.side <> o.side
      where o.side = 'home'
      group by 1, 2, 3
      having count(distinct o.match_id) >= 5
    ),
    tornei as (
      select competition_id, season_id
      from q group by 1, 2
      having count(*) filter (where campione >= 5) >= 2
    )
    select count(*)::text as n
    from q join tornei using (competition_id, season_id)
    where q.campione between 1 and 4
  `;
  assert.equal(
    mezzo[0]?.n, "0",
    "esistono squadre con un campione fra uno e quattro in un torneo con metro: la soglia "
      + "della lettura ora morde davvero, e il guasto che la toglie deve far fallire "
      + "la prova sul campione minimo",
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
        casa.gare !== fuori.gare || falliCasa.prodotto.media !== falliFuori.prodotto.media,
        "casa e trasferta danno gare e falli identici: il filtro sul lato non morde",
      );
    }
  }
});

test("il metro e' quello del lato, ricontato sulla distribuzione", opzioni, async () => {
  const caso = await unCaso();
  const lato = await medieDiLato(caso.squadra, caso.competizione, caso.stagione, "home");
  assert.ok(lato !== null);
  const sql = connessione();
  assert.ok(sql !== null);

  const falli = lato.voci.find((v) => v.chiave === "falli");
  if (falli === undefined) return;

  // Si ricostruisce a mano la distribuzione delle **sole gare in casa** e si ricontano
  // media di lega e posizione. Se la finestra fosse sbagliata - senza il lato, senza la
  // stagione, o divisa per tutte le squadre invece che per quelle che il dato ce l'hanno -
  // il numero uscirebbe plausibile e nessuno se ne accorgerebbe guardando la pagina.
  const distribuzione = await sql<
    { squadra: string; falli: string | null; campione: string }[]
  >`
    select o.team_id::text as squadra,
           avg(o.fouls) filter (
             where o.fouls is not null and a.fouls is not null
           )::text as falli,
           count(*) filter (
             where o.fouls is not null and a.fouls is not null
           )::text as campione
    from football.team_match_observations o
    join football.team_match_observations a
      on a.match_id = o.match_id and a.side <> o.side
    join football.competitions c on c.id = o.competition_id
    join football.seasons s on s.id = o.season_id
    where c.source_id = ${caso.competizione}::bigint
      and s.source_id = ${caso.stagione}::bigint
      and o.side = 'home'
    group by 1
    having count(distinct o.match_id) >= 5
  `;

  assert.equal(
    distribuzione.length, lato.squadre,
    "le squadre del metro non sono quelle che compongono la distribuzione del lato",
  );

  // **Nel metro entrano solo le squadre confrontabili.** Una senza falli osservati ha media
  // nulla, e contarla fra quelle sotto sarebbe far diventare zero un'assenza. Una con due
  // gare ha una media, ma non e' un termine di paragone: falserebbe la posizione di tutte
  // le altre, ed e' la ragione per cui il modulo la tiene fuori.
  const conIlDato = distribuzione.filter(
    (r) => r.falli !== null && Number(r.campione) >= 5,
  );
  const mediaDiLega = conIlDato.reduce((t, r) => t + Number(r.falli), 0) / conIlDato.length;
  assert.ok(
    Math.abs(falli.prodotto.mediaDiLega - mediaDiLega) < 1e-6,
    `media di lega ${falli.prodotto.mediaDiLega}, ricontata ${mediaDiLega}`,
  );

  const sotto = conIlDato.filter((r) => Number(r.falli) < falli.prodotto.media).length;
  const dichiarate = Math.round(falli.prodotto.posizione * (conIlDato.length - 1));
  assert.equal(
    dichiarate, sotto,
    `il metro dice di superarne ${dichiarate}, la distribuzione ne conta ${sotto}`,
  );

  for (const voce of lato.voci) {
    assert.ok(
      voce.prodotto.posizione >= 0 && voce.prodotto.posizione <= 1,
      `${voce.nome}: posizione ${voce.prodotto.posizione} fuori scala`,
    );
    assert.ok(
      voce.concesso.posizione >= 0 && voce.concesso.posizione <= 1,
      `${voce.nome}: posizione del concesso fuori scala`,
    );
  }
});

test("la posizione si divide per le squadre che il dato ce l'hanno", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null);

  // **Perche' serve un torneo apposta.** Dove tutte le squadre portano la metrica, dividere
  // per tutte o per quelle col dato da lo stesso numero, e il guasto resta invisibile. In
  // J1 League venti squadre arrivano a cinque gare in casa e **dieci** portano i falli:
  // li' il denominatore sbagliato dimezza la posizione, e una squadra in testa risulta a
  // meta' classifica. Il caso si cerca nei dati, non si scrive a mano.
  const tornei = await sql<
    { competizione: string; stagione: string; squadre: string; con: string }[]
  >`
    with q as (
      select o.competition_id, o.season_id, o.team_id,
             count(*) filter (
               where o.fouls is not null and a.fouls is not null
             ) as campione
      from football.team_match_observations o
      join football.team_match_observations a
        on a.match_id = o.match_id and a.side <> o.side
      where o.side = 'home'
      group by 1, 2, 3
      having count(distinct o.match_id) >= 5
    )
    select c.source_id::text as competizione, s.source_id::text as stagione,
           count(*)::text as squadre,
           count(*) filter (where q.campione >= 5)::text as con
    from q
    join football.competitions c on c.id = q.competition_id
    join football.seasons s on s.id = q.season_id
    group by 1, 2
    having count(*) filter (where q.campione >= 5) >= 2
       and count(*) > count(*) filter (where q.campione >= 5)
    order by count(*) - count(*) filter (where q.campione >= 5) desc
    limit 1
  `;
  const torneo = tornei[0];
  if (torneo === undefined) {
    assert.fail(
      "nessun torneo dove il dato manca a qualche squadra: il denominatore non e' piu' "
        + "esercitato, e il guasto che lo sbaglia non farebbe arrossire nulla",
    );
  }

  // La squadra con la media falli piu' alta **fra quelle confrontabili**, cioe' con il
  // campione sopra la soglia. L'ordinamento e' sul valore, non sul testo: la prima stesura
  // ordinava la colonna gia' convertita, e «9.5» risultava maggiore di «12.3».
  const squadre = await sql<{ squadra: string; nome: string; falli: string }[]>`
    select t.source_id::text as squadra, t.name as nome,
           (avg(o.fouls) filter (
             where o.fouls is not null and a.fouls is not null
           ))::text as falli
    from football.team_match_observations o
    join football.team_match_observations a
      on a.match_id = o.match_id and a.side <> o.side
    join football.teams t on t.id = o.team_id
    join football.competitions c on c.id = o.competition_id
    join football.seasons s on s.id = o.season_id
    where c.source_id = ${torneo.competizione}::bigint
      and s.source_id = ${torneo.stagione}::bigint
      and o.side = 'home'
    group by 1, 2
    having count(distinct o.match_id) >= 5
       and count(*) filter (
             where o.fouls is not null and a.fouls is not null
           ) >= 5
    order by avg(o.fouls) filter (
      where o.fouls is not null and a.fouls is not null
    ) desc
    limit 1
  `;
  const scelta = squadre[0];
  assert.ok(scelta !== undefined, "nessuna squadra con i falli nel torneo scelto");

  const lato = await medieDiLato(
    Number(scelta.squadra), Number(torneo.competizione), Number(torneo.stagione), "home",
  );
  assert.ok(lato !== null, `nessun lato per ${scelta.nome}`);
  const falli = lato.voci.find((v) => v.chiave === "falli");
  assert.ok(falli !== undefined, `${scelta.nome} non ha i falli fra le voci`);

  // La squadra scelta e' quella con la media piu' alta fra chi il dato ce l'ha: la sua
  // posizione dev'essere **1**, cioe' le supera tutte. Dividendo per tutte le squadre del
  // torneo uscirebbe una frazione, ed e' esattamente il difetto.
  assert.equal(
    falli.prodotto.posizione, 1,
    `${scelta.nome} ha la media falli piu' alta fra le ${torneo.con} squadre che il dato ce `
      + `l'hanno, ma la posizione dichiarata e' ${falli.prodotto.posizione}: il denominatore `
      + `conta tutte le ${torneo.squadre} squadre invece delle ${torneo.con} confrontabili`,
  );
});


test("la quota della shot map si fa sui totali, non come media delle quote", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");

  // Si sceglie il caso in cui le due formule si separano di piu': su una squadra dove
  // coincidono la prova sarebbe verde comunque, e non direbbe niente.
  const casi = await sql<{
    squadra: string; nome: string; competizione: string; stagione: string;
    pesata: string; non_pesata: string;
  }[]>`
    select t.source_id::text as squadra, t.name as nome,
           c.source_id::text as competizione, s.source_id::text as stagione,
           (sum(o.shot_map_share_in_box * o.shot_map_total)
              / sum(o.shot_map_total))::text as pesata,
           (avg(o.shot_map_share_in_box))::text as non_pesata
    from football.team_match_observations o
    join football.team_match_observations a
      on a.match_id = o.match_id and a.side <> o.side
    join football.teams t on t.id = o.team_id
    join football.competitions c on c.id = o.competition_id
    join football.seasons s on s.id = o.season_id
    where o.side = 'home'
      and o.shot_map_share_in_box is not null and a.shot_map_share_in_box is not null
      and o.shot_map_total is not null and a.shot_map_total is not null
    group by 1, 2, 3, 4
    having count(*) >= 5
    order by abs(sum(o.shot_map_share_in_box * o.shot_map_total) / sum(o.shot_map_total)
                 - avg(o.shot_map_share_in_box)) desc
    limit 1
  `;
  const caso = casi[0];
  assert.ok(caso !== undefined, "nessuna squadra con la shot map su cinque gare in casa");

  const pesata = Number(caso.pesata);
  const nonPesata = Number(caso.non_pesata);
  const divario = Math.abs(pesata - nonPesata);
  // Se il divario massimo dell'intero livello dati fosse trascurabile, questa prova non
  // saprebbe piu' distinguere le due formule: si dice, invece di restare verde a vuoto.
  assert.ok(
    divario > 0.005,
    `il divario massimo fra quota sui totali e media delle quote e' ${(divario * 100).toFixed(2)} `
      + "punti: sotto mezzo punto la prova non discrimina piu' le due formule",
  );

  const lato = await medieDiLato(
    Number(caso.squadra), Number(caso.competizione), Number(caso.stagione), "home",
  );
  assert.ok(lato !== null, `nessun lato per ${caso.nome}`);
  const quota = lato.voci.find((v) => v.chiave === "quota_area");
  assert.ok(quota !== undefined, `${caso.nome} non ha la quota dall'area fra le voci`);

  assert.ok(
    Math.abs(quota.prodotto.media - pesata) < 1e-9,
    `${caso.nome}: quota dichiarata ${quota.prodotto.media}, sui totali ${pesata}`,
  );
  assert.ok(
    Math.abs(quota.prodotto.media - nonPesata) > 1e-9,
    `${caso.nome}: la quota dichiarata coincide con la media delle quote di gara `
      + `(${nonPesata}), che pesa una partita da tre tiri quanto una da venti`,
  );
});

test("l'errore della media viene dalle gare, non dalle squadre", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const caso = await unCaso();

  const conti = await sql<{ scarto: string; campione: string }[]>`
    select (stddev_samp(o.fouls) filter (
             where o.fouls is not null and a.fouls is not null
           ))::text as scarto,
           (count(*) filter (
             where o.fouls is not null and a.fouls is not null
           ))::text as campione
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
  `;
  const conto = conti[0];
  assert.ok(conto !== undefined, `nessun conto per ${caso.nome}`);
  const atteso = Number(conto.scarto) / Math.sqrt(Number(conto.campione));

  const lato = await medieDiLato(caso.squadra, caso.competizione, caso.stagione, "home");
  assert.ok(lato !== null, `nessun lato per ${caso.nome}`);
  const falli = lato.voci.find((v) => v.chiave === "falli");
  assert.ok(falli !== undefined, `${caso.nome} non ha i falli fra le voci`);
  assert.ok(falli.prodotto.errore !== null, `${caso.nome}: errore della media assente`);

  assert.ok(
    Math.abs(falli.prodotto.errore - atteso) < 1e-9,
    `${caso.nome}: errore dichiarato ${falli.prodotto.errore}, ricontato sulle sue gare `
      + `${atteso}. Con lo scarto fra le squadre uscirebbe `
      + `${(falli.prodotto.dispersione ?? NaN) / Math.sqrt(falli.campione)}, che e' un'altra cosa`,
  );
});
