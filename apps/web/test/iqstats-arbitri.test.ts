// Prove d'integrazione dell'area Arbitri: girano solo con una connessione al livello dati.
//
// Senza `IQSTATS_PROJECTION_DATABASE_URL` si saltano invece di fallire, come fa
// `test:projection-store`: un test che non puo' girare non deve diventare un rosso che
// nessuno sa spiegare.
//
// Quello che verificano non e' «il numero e' questo» — cambia a ogni passata — ma che gli
// invarianti reggano: campione sopra la soglia, medie non negative, posizione dentro la
// scala, e la somma dei due lati che torna al totale.
import assert from "node:assert/strict";
import test from "node:test";

import { connessione } from "../src/server/iqstats/lettura.ts";
import {
  arbitroControLeSquadre,
  classificaArbitri,
  competizioniConArbitri,
  metriDiLega,
  PRECEDENTI_PER_MEDIA,
  profiloArbitro,
} from "../src/server/iqstats/referees.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

test("le competizioni hanno almeno tre arbitri e gare coerenti", opzioni, async () => {
  const competizioni = await competizioniConArbitri();
  assert.ok(competizioni.length > 0, "nessuna competizione: il livello dati non risponde?");
  for (const c of competizioni) {
    assert.ok(c.arbitri >= 3, `${c.nome} ha ${c.arbitri} arbitri, sotto la soglia dichiarata`);
    assert.ok(c.gare >= c.arbitri * 5, `${c.nome}: ${c.gare} gare per ${c.arbitri} arbitri`);
    assert.ok(c.nome.length > 0);
  }
});

test("la classifica rispetta la soglia e l'ordine dichiarati", opzioni, async () => {
  const competizioni = await competizioniConArbitri();
  const classifica = await classificaArbitri(competizioni[0].sourceId, "gialli");
  assert.ok(classifica.length >= 3);
  for (const r of classifica) {
    assert.ok(r.gare >= 5, `${r.nome} ha ${r.gare} gare, sotto le cinque dichiarate`);
    assert.ok(r.falli >= 0 && r.gialli >= 0 && r.rossi >= 0, `${r.nome} ha una media negativa`);
    // Un nome che resta segnaposto vuol dire anagrafica non caricata: la pagina lo
    // mostrerebbe cosi' com'e', ed e' esattamente cio' che non deve succedere.
    assert.ok(!r.nome.includes("segnaposto"), `${r.nome}: anagrafica non caricata`);
  }
  for (let i = 1; i < classifica.length; i += 1) {
    assert.ok(
      classifica[i].gialli <= classifica[i - 1].gialli,
      `ordine rotto fra ${classifica[i - 1].nome} e ${classifica[i].nome}`,
    );
  }
});

test("il profilo torna coerente con la sua classifica", opzioni, async () => {
  const competizioni = await competizioniConArbitri();
  const classifica = await classificaArbitri(competizioni[0].sourceId, "gialli");
  const primo = classifica[0];
  const p = await profiloArbitro(primo.sourceId);

  assert.ok(p !== null, `profilo mancante per ${primo.nome}`);
  assert.equal(p.nome, primo.nome);
  assert.ok(p.gare >= 5);

  // I due lati sono una scomposizione del totale, non due misure indipendenti.
  const sommaFalli = p.falliControCasa + p.falliControTrasferta;
  assert.ok(
    Math.abs(sommaFalli - p.media.falli) < 1e-6,
    `casa ${p.falliControCasa} + ospite ${p.falliControTrasferta} != totale ${p.media.falli}`,
  );
  const sommaGialli = p.gialliControCasa + p.gialliControTrasferta;
  assert.ok(Math.abs(sommaGialli - p.media.gialli) < 1e-6);

  for (const posizione of [p.posizioneFalli, p.posizioneGialli]) {
    if (posizione === null) continue;
    assert.ok(posizione.quota >= 0 && posizione.quota <= 1, `quota ${posizione.quota}`);
    assert.ok(posizione.colleghi >= 3);
  }

  // Chi guida la classifica dei gialli deve stare in alto anche nella sua posizione.
  if (p.posizioneGialli !== null) {
    assert.ok(
      p.posizioneGialli.quota >= 0.5,
      `il primo per gialli sta al ${Math.round(p.posizioneGialli.quota * 100)}%`,
    );
  }
});

test("lo storico non supera le gare dichiarate", opzioni, async () => {
  const competizioni = await competizioniConArbitri();
  const classifica = await classificaArbitri(competizioni[0].sourceId, "falli");
  const p = await profiloArbitro(classifica[0].sourceId);
  assert.ok(p !== null);
  assert.ok(p.storico.length > 0, "un arbitro con gare deve avere uno storico");
  assert.ok(p.storico.length <= p.gare, "lo storico non puo' avere piu' righe delle gare");
  for (const g of p.storico) {
    assert.ok(g.casa.length > 0 && g.trasferta.length > 0);
    assert.ok(g.falli >= 0 && g.gialli >= 0 && g.rossi >= 0);
  }
  // Ordinato dalla piu' recente: e' quello che la pagina promette.
  for (let i = 1; i < p.storico.length; i += 1) {
    assert.ok(p.storico[i].quando <= p.storico[i - 1].quando, "storico fuori ordine");
  }
});

test("un arbitro che non esiste non diventa un profilo vuoto", opzioni, async () => {
  assert.equal(await profiloArbitro(999_999_999), null);
});

test("la data di una competizione copre i suoi arbitri e non quelli delle altre", opzioni, async () => {
  const competizioni = await competizioniConArbitri();

  // **Il difetto da prendere e' il massimo globale.** Una data sola per tutte sarebbe vera
  // come massimo e falsa come copertura: la competizione piu' ferma e' indietro di mesi
  // rispetto alla piu' aggiornata. Se `ultima` diventasse globale, tutte le date sarebbero
  // identiche - non per come sono i dati, ma per come sarebbe scritta la query.
  const distinte = new Set(competizioni.map((c) => c.ultima));
  assert.ok(
    distinte.size > 1,
    `tutte e ${competizioni.length} le competizioni dichiarano la stessa data: e' un massimo globale, non una copertura`,
  );

  for (const c of competizioni) {
    assert.ok(!Number.isNaN(new Date(c.ultima).getTime()), `${c.nome}: data illeggibile "${c.ultima}"`);
  }

  // La competizione con meno arbitri: poche interrogazioni, e l'invariante vale su tutte.
  const piuPiccola = competizioni[competizioni.length - 1];
  const classifica = await classificaArbitri(piuPiccola.sourceId, "gialli");
  const profili = await Promise.all(classifica.map((r) => profiloArbitro(r.sourceId)));

  let massimoDeiSuoi: string | null = null;
  for (const p of profili) {
    if (p === null || p.ultima === null) continue;
    assert.ok(
      new Date(p.ultima).getTime() <= new Date(piuPiccola.ultima).getTime(),
      `${p.nome} ha diretto il ${p.ultima}, dopo il ${piuPiccola.ultima} dichiarato da ${piuPiccola.nome}`,
    );
    if (massimoDeiSuoi === null || p.ultima > massimoDeiSuoi) massimoDeiSuoi = p.ultima;
  }

  assert.ok(massimoDeiSuoi !== null, `${piuPiccola.nome}: nessun arbitro con una data`);
  assert.equal(
    new Date(massimoDeiSuoi).getTime(),
    new Date(piuPiccola.ultima).getTime(),
    `${piuPiccola.nome} dichiara ${piuPiccola.ultima} ma i suoi arbitri arrivano a ${massimoDeiSuoi}`,
  );
});

test("la data del profilo e' l'ultima gara del suo storico", opzioni, async () => {
  const competizioni = await competizioniConArbitri();
  const classifica = await classificaArbitri(competizioni[0].sourceId, "falli");
  const p = await profiloArbitro(classifica[0].sourceId);
  assert.ok(p !== null);

  // Lo storico e' `order by kickoff_at desc limit 20`: la prima riga e' il massimo vero
  // anche se il taglio ne lascia fuori altre, perche' il taglio prende dalla coda.
  assert.ok(p.ultima !== null, "un arbitro con gare deve dichiarare una data");
  const massimo = p.storico.reduce((piu, g) => (g.quando > piu ? g.quando : piu), p.storico[0].quando);
  assert.equal(p.ultima, massimo, `dichiara ${p.ultima} ma lo storico arriva a ${massimo}`);
});

test("il metro di lega, quota per lato compresa, ricontato a mano", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const competizioni = await competizioniConArbitri();
  assert.ok(competizioni.length > 0);

  // La competizione con piu' arbitri: e' quella dove media e dispersione poggiano su piu'
  // direttori, quindi dove un errore nella finestra si vedrebbe meglio.
  const scelta = [...competizioni].sort((a, b) => b.arbitri - a.arbitri)[0];
  assert.ok(scelta !== undefined);

  const metri = await metriDiLega([scelta.sourceId]);
  const metro = metri.get(`${scelta.sourceId}|`);
  assert.ok(metro !== undefined, `nessun metro per ${scelta.nome}`);

  // Si ricostruiscono a mano i totali di ogni arbitro della competizione e si rifanno la
  // media delle quote e la sua dispersione. Se la quota fosse calcolata come media di
  // quote di singole gare, una partita da un cartellino solo peserebbe quanto una da otto,
  // e il numero uscirebbe plausibile lo stesso.
  const arbitri = await sql<{ gare: string; gialli: string | null; casa: string | null }[]>`
    with per_gara as (
      select o.match_id, o.referee_id,
             case when count(*) filter (where o.yellow_cards is not null) = 2
                  then sum(o.yellow_cards) end as gialli,
             case when count(*) filter (where o.yellow_cards is not null) = 2
                  then sum(o.yellow_cards) filter (where o.side = 'home') end as casa
      from football.team_match_observations o
      join football.competitions c on c.id = o.competition_id
      where c.source_id = ${scelta.sourceId}::bigint
      group by 1, 2
      having count(*) = 2
    )
    select count(*)::text as gare, sum(gialli)::text as gialli, sum(casa)::text as casa
    from per_gara where referee_id is not null group by referee_id
  `;

  const nelMetro = arbitri.filter((a) => Number(a.gare) >= 5);
  assert.equal(
    nelMetro.length, metro.arbitri,
    `il metro dichiara ${metro.arbitri} arbitri, ricontati ${nelMetro.length}`,
  );

  const quote = nelMetro
    .filter((a) => a.gialli !== null && Number(a.gialli) > 0 && a.casa !== null)
    .map((a) => Number(a.casa) / Number(a.gialli));
  assert.ok(quote.length >= 2, "meno di due arbitri con cartellini: niente da confrontare");

  const media = quote.reduce((t, q) => t + q, 0) / quote.length;
  assert.ok(metro.quotaGialliCasa !== null, "la quota di lega non c'e'");
  assert.ok(
    Math.abs(metro.quotaGialliCasa - media) < 1e-9,
    `quota di lega ${metro.quotaGialliCasa}, ricontata ${media}`,
  );
  // Una quota e' una parte di un totale: fuori da zero e uno non e' una quota.
  assert.ok(
    metro.quotaGialliCasa > 0 && metro.quotaGialliCasa < 1,
    `quota di lega ${metro.quotaGialliCasa} fuori scala`,
  );

  const varianza = quote.reduce((t, q) => t + (q - media) ** 2, 0) / (quote.length - 1);
  assert.ok(metro.dispersioneQuotaGialliCasa !== null, "la dispersione della quota non c'e'");
  assert.ok(
    Math.abs(metro.dispersioneQuotaGialliCasa - Math.sqrt(varianza)) < 1e-9,
    `dispersione ${metro.dispersioneQuotaGialliCasa}, ricontata ${Math.sqrt(varianza)}`,
  );
});

test("dentro il dossier il profilo esce dalla competizione della gara", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");

  // Un arbitro che ha diretto in due competizioni, con la secondaria sopra soglia: e' il
  // caso in cui la competizione con piu' gare - la scelta di prima - dava il metro di un
  // altro torneo. Sull'archivio del 3 settembre 2026 sono 329 gare su 9.240.
  const [caso] = await sql<Array<{
    arbitro: string; competizione: string; stagione: string;
  }>>`
    with per_gara as (
      select o.referee_id, o.competition_id, o.season_id, o.match_id
      from football.team_match_observations o
      where o.referee_id is not null and o.fouls is not null and o.yellow_cards is not null
      group by 1, 2, 3, 4 having count(*) = 2
    ),
    per_arbitro as (
      select referee_id, competition_id, count(*) as gare from per_gara group by 1, 2
    ),
    principale as (
      select distinct on (referee_id) * from per_arbitro
      order by referee_id, gare desc, competition_id
    )
    select r.source_id::text as arbitro, c.source_id::text as competizione,
           s.source_id::text as stagione
    from per_gara g
    join per_arbitro a on a.referee_id = g.referee_id and a.competition_id = g.competition_id
    join principale p on p.referee_id = g.referee_id and p.competition_id <> g.competition_id
    join football.referees r on r.id = g.referee_id
    join football.competitions c on c.id = g.competition_id
    join football.seasons s on s.id = g.season_id
    where a.gare >= 5
    group by 1, 2, 3
    order by count(*) desc
    limit 1
  `;
  if (caso === undefined) return; // l'archivio non ha il caso: niente da provare

  const contestuale = await profiloArbitro(Number(caso.arbitro), {
    competitionSourceId: Number(caso.competizione),
    seasonSourceId: Number(caso.stagione),
  });
  const generale = await profiloArbitro(Number(caso.arbitro));
  assert.ok(contestuale !== null && generale !== null);
  assert.equal(
    contestuale.competitionSourceId, Number(caso.competizione),
    "il profilo del dossier non e' quello della competizione della gara",
  );
  assert.notEqual(
    contestuale.competitionSourceId, generale.competitionSourceId,
    "il profilo del dossier ha ripreso la competizione principale dell'arbitro",
  );

  // Senza gare nostre in quella competizione non si ripiega su un altro torneo: si tace.
  assert.equal(
    await profiloArbitro(Number(caso.arbitro), {
      competitionSourceId: 999_999, seasonSourceId: Number(caso.stagione),
    }),
    null,
    "senza gare in quella competizione il profilo deve mancare, non venire da altrove",
  );
});

test("i precedenti con le due squadre reggono le loro soglie", opzioni, async () => {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");

  // Una gara vera con l'arbitro e le due squadre, presa dall'archivio.
  const [gara] = await sql<Array<{ arbitro: string; casa: string; ospite: string }>>`
    select r.source_id::text as arbitro, casa.source_id::text as casa,
           ospite.source_id::text as ospite
    from football.matches m
    join football.referees r on r.id = m.referee_id
    join football.teams casa on casa.id = m.home_team_id
    join football.teams ospite on ospite.id = m.away_team_id
    where m.referee_id is not null
    order by m.kickoff_at desc
    limit 1
  `;
  assert.ok(gara !== undefined, "nessuna gara con arbitro nell'archivio");

  const contro = await arbitroControLeSquadre(
    Number(gara.arbitro), Number(gara.casa), Number(gara.ospite),
  );
  if (contro === null) return; // l'arbitro non ha precedenti con nessuna delle due

  for (const squadra of [contro.casa, contro.trasferta]) {
    assert.equal(
      squadra.inCasa.gare + squadra.inTrasferta.gare, squadra.precedenti,
      "i due lati non tornano al totale dei precedenti",
    );
    if (squadra.precedenti < PRECEDENTI_PER_MEDIA) {
      assert.equal(squadra.gialli, null, "media calcolata sotto il campione minimo");
      assert.equal(squadra.falli, null, "media calcolata sotto il campione minimo");
    } else {
      assert.ok(squadra.gialli !== null && squadra.gialli >= 0);
      assert.ok(squadra.falli !== null && squadra.falli >= 0);
    }
    if (squadra.precedenti > 0) {
      assert.ok(squadra.dal !== null && squadra.al !== null && squadra.dal <= squadra.al);
    }
  }
  // La media di riferimento e' per lato, quindi sta sotto la media di gara del profilo.
  assert.ok(contro.abituale.gialli > 0 && contro.abituale.lati > 0);
  const profilo = await profiloArbitro(Number(gara.arbitro));
  if (profilo !== null) {
    assert.ok(
      contro.abituale.gialli < profilo.media.gialli,
      `per lato ${contro.abituale.gialli} non e' sotto la media di gara ${profilo.media.gialli}`,
    );
  }
});
