// Prove d'integrazione delle statistiche di squadra: girano solo con una connessione.
//
// Senza `IQSTATS_PROJECTION_DATABASE_URL` si saltano invece di fallire, come `test:arbitri`
// e `test:team-metro`.
//
// Quello che verificano non e' «il numero e' questo» — cambia a ogni passata — ma i tre
// invarianti che, se cadessero, nessuno vedrebbe guardando la pagina:
//
// 1. **la finestra dei 365 giorni esiste davvero.** Il caso si sceglie fra le squadre che
//    hanno gare **fuori** dalla finestra, cosi' togliere il filtro cambia il numero;
// 2. **la classifica sta dentro una stagione sola.** Senza il filtro mescolerebbe due
//    stagioni e chi ha giocato di piu' salirebbe per aver giocato di piu';
// 3. **una differenza non regge finche' non supera due errori standard.** E' la regola che
//    tiene onesto il Confronto, ed e' aritmetica: si prova senza database.
import assert from "node:assert/strict";
import test from "node:test";

import { connessione } from "../src/server/iqstats/lettura.ts";
import {
  classificaSquadre,
  competizioniConSquadre,
  differenzaFraSquadre,
  profiloSquadra,
  type VoceStatistica,
} from "../src/server/iqstats/team-stats.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

/**
 * Una squadra che ha gare **dentro e fuori** la finestra.
 *
 * Se il caso avesse tutte le gare dentro i 365 giorni, la prova passerebbe anche con il
 * filtro tolto: non verificherebbe niente.
 */
async function unaSquadraACavallo(): Promise<{ squadra: number; nome: string; fuori: number }> {
  const sql = connessione();
  assert.ok(sql !== null, "nessuna connessione");
  const righe = await sql<{ squadra: string; nome: string; fuori: string }[]>`
    select t.source_id::text as squadra, t.name as nome,
           count(*) filter (where o.kickoff_at < now() - interval '365 days')::text as fuori
    from football.team_match_observations o
    join football.teams t on t.id = o.team_id
    group by 1, 2
    having count(*) filter (where o.kickoff_at >= now() - interval '365 days') >= 10
       and count(*) filter (where o.kickoff_at < now() - interval '365 days') >= 5
    order by count(*) desc
    limit 1
  `;
  const riga = righe[0];
  assert.ok(riga !== undefined, "nessuna squadra con gare dentro e fuori la finestra");
  return { squadra: Number(riga.squadra), nome: riga.nome, fuori: Number(riga.fuori) };
}

test("il profilo poggia sui 365 giorni, non su tutto lo storico", opzioni, async () => {
  const caso = await unaSquadraACavallo();
  const sql = connessione();
  assert.ok(sql !== null);

  const profilo = await profiloSquadra(caso.squadra);
  assert.ok(profilo !== null, `nessun profilo per ${caso.nome}`);
  assert.equal(profilo.nome, caso.nome);

  // Le gare dichiarate sono quelle dentro la finestra, e sono meno di tutte quelle che
  // abbiamo: e' la riga che diventa rossa se il filtro temporale sparisce.
  const conteggi = await sql<{ dentro: string; tutte: string; tiri: string }[]>`
    select count(*) filter (where o.kickoff_at >= now() - interval '365 days')::text as dentro,
           count(*)::text as tutte,
           count(o.total_shots) filter
             (where o.kickoff_at >= now() - interval '365 days')::text as tiri
    from football.team_match_observations o
    join football.teams t on t.id = o.team_id
    where t.source_id = ${caso.squadra}::bigint
  `;
  const dentro = Number(conteggi[0]?.dentro);
  const tutte = Number(conteggi[0]?.tutte);
  assert.equal(profilo.gare, dentro, "le gare dichiarate non sono quelle della finestra");
  assert.ok(
    dentro < tutte,
    `il caso non e' a cavallo: ${dentro} dentro su ${tutte} — la prova non verificherebbe nulla`,
  );

  // `dal` e `al` sono la finestra vera, quella che la pagina scrive accanto ai numeri.
  const limite = Date.now() - 365 * 24 * 60 * 60 * 1000;
  assert.ok(
    Date.parse(profilo.dal) >= limite,
    `la prima gara dichiarata (${profilo.dal}) cade fuori dai 365 giorni`,
  );
  assert.ok(Date.parse(profilo.al) >= Date.parse(profilo.dal), "finestra rovesciata");

  // Il campione di un bersaglio e' quello che regge **quella** media, non le gare giocate:
  // `avg()` salta i nulli e le colonne non si riempiono insieme.
  const tiri = profilo.voci.find((v) => v.chiave === "tiri");
  if (tiri !== undefined) {
    assert.equal(
      tiri.campione, Number(conteggi[0]?.tiri),
      "il campione dei tiri non e' il numero di gare che portano quel dato",
    );
  }
  for (const voce of profilo.voci) {
    assert.ok(voce.campione >= 5, `${voce.nome}: campione ${voce.campione} sotto la soglia`);
    assert.ok(
      voce.campione <= profilo.gare,
      `${voce.nome}: campione ${voce.campione} sopra le ${profilo.gare} gare della finestra`,
    );
    assert.ok(voce.scarto >= 0, `${voce.nome}: scarto negativo`);
    assert.ok(Number.isFinite(voce.media), `${voce.nome}: media non finita`);
  }
  assert.equal(
    profilo.voci.length + profilo.assenti.length, 20,
    "i venti bersagli devono essere tutti o misurati o dichiarati assenti",
  );
  assert.ok(
    profilo.voci.some((v) => v.gruppo === "principale"),
    "nessun bersaglio principale: la pagina resterebbe col solo menu' dei dettagli",
  );
});

test("la classifica sta dentro una stagione sola, ordinata", opzioni, async () => {
  const competizioni = await competizioniConSquadre();
  assert.ok(competizioni.length > 0, "nessuna competizione con abbastanza squadre");
  const prima = competizioni[0];
  assert.ok(prima !== undefined);

  const classifica = await classificaSquadre(prima.sourceId, "tiri");
  assert.ok(classifica.length >= 4, `solo ${classifica.length} squadre in classifica`);

  for (let i = 1; i < classifica.length; i += 1) {
    const sopra = classifica[i - 1];
    const sotto = classifica[i];
    assert.ok(sopra !== undefined && sotto !== undefined);
    assert.ok(
      sopra.media >= sotto.media,
      `classifica fuori ordine: ${sopra.nome} ${sopra.media} sotto ${sotto.nome} ${sotto.media}`,
    );
  }
  for (const riga of classifica) {
    assert.ok(riga.campione >= 5, `${riga.nome}: campione ${riga.campione} sotto la soglia`);
  }

  // **Una stagione sola.** Ogni squadra in classifica deve avere righe in una sola coppia
  // competizione+stagione fra quelle usate: se il filtro cadesse, la stessa squadra
  // porterebbe due stagioni sommate e il campione lo direbbe.
  const sql = connessione();
  assert.ok(sql !== null);
  const stagioni = await sql<{ n: string }[]>`
    with recente as (
      select o.competition_id, o.season_id
      from football.team_match_observations o
      join football.competitions c on c.id = o.competition_id
      where c.source_id = ${prima.sourceId}::bigint
      group by 1, 2
      order by max(o.kickoff_at) desc
      limit 1
    )
    select count(o.total_shots)::text as n
    from football.team_match_observations o
    join recente r on r.competition_id = o.competition_id and r.season_id = o.season_id
    join football.teams t on t.id = o.team_id
    where t.source_id = ${classifica[0]?.sourceId ?? 0}::bigint
  `;
  assert.equal(
    Number(stagioni[0]?.n), classifica[0]?.campione,
    "il campione della prima in classifica non e' quello della stagione piu' recente",
  );
});

test("una differenza non regge finche' non supera due errori standard", () => {
  const voce = (media: number, scarto: number, campione: number): VoceStatistica => ({
    chiave: "tiri", nome: "Tiri", gruppo: "principale", percentuale: false,
    campione, media, scarto,
  });

  // Il caso vero: con lo scarto misurato sul database (4,86) e otto gare per parte,
  // l'errore della differenza vale 2,43. Tre tiri di scarto non bastano.
  const stretto = differenzaFraSquadre(voce(14, 4.86, 8), voce(11, 4.86, 8));
  assert.ok(stretto !== null);
  assert.ok(Math.abs(stretto.differenza - 3) < 1e-9);
  assert.ok(Math.abs(stretto.errore - 2.43) < 0.01, `errore ${stretto.errore}`);
  assert.equal(stretto.regge, false, "tre tiri su otto gare non distinguono due squadre");

  // Le stesse due medie con trentuno gare per parte — la finestra dei 365 giorni — hanno
  // errore 1,23: adesso reggono. E' il motivo per cui la finestra e' quella.
  const largo = differenzaFraSquadre(voce(14, 4.86, 31), voce(11, 4.86, 31));
  assert.ok(largo !== null);
  assert.ok(Math.abs(largo.errore - 1.234) < 0.01, `errore ${largo.errore}`);
  assert.equal(largo.regge, true, "tre tiri su trentuno gare per parte devono reggere");

  // Sotto le due gare non c'e' errore da calcolare, quindi non c'e' niente da dichiarare.
  assert.equal(differenzaFraSquadre(voce(14, 4.86, 1), voce(11, 4.86, 8)), null);
});
