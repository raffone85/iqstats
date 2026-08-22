import "server-only";

import postgres from "postgres";

import { ARTEFATTI_DI_PRODUZIONE } from "./projection-artefatti.ts";
import { calcolaFeature } from "./projection/asof/calcolo.ts";
import { proiezioneDiGara, type ProiezioneDiGara } from "./projection/match.ts";
import { proietta } from "./projection/production.ts";
import { componiIngresso } from "./projection/snapshot.ts";
import {
  mediaOsservata,
  ProjectionObservationStore,
  type GaraDaPrevedere,
  type MediaOsservata,
} from "./projection-store.ts";
import type { MatchDetail } from "./match-context.ts";

/**
 * Il motore di proiezione al servizio di una pagina.
 *
 * Tre confini che questo modulo non supera.
 *
 * **La connessione e' sua.** `IQSTATS_PROJECTION_DATABASE_URL` e non
 * `IQSTATS_DATABASE_URL`: quest'ultima cambierebbe la strada con cui *tutta*
 * l'applicazione legge le gare — `runtime.ts` passerebbe all'ibrido — e il motore non ha
 * nessun motivo di decidere quello. Senza la variabile non si proietta e non si finge: la
 * sezione non compare.
 *
 * **Gli identificativi si risolvono, non si assumono.** La pagina conosce quelli della
 * fonte, il livello dati i propri: la traduzione passa da `source_id`. Una squadra che il
 * livello dati non conosce non diventa un'altra squadra: non si proietta.
 *
 * **La gara da prevedere non deve esistere nel database.** Le interrogazioni dello store
 * sono per squadra, stagione, arbitro e istante — mai per l'identificativo della gara —
 * quindi una gara futura si proietta dalla storia delle due squadre, che e' l'unica cosa
 * che serve. E' anche il motivo per cui il taglio «al momento di» resta esatto: la riga di
 * quella gara non esiste ancora.
 */

let cliente: ReturnType<typeof postgres> | undefined;

function connessione(): ReturnType<typeof postgres> | null {
  const indirizzo = process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim();
  if (!indirizzo) return null;
  cliente ??= postgres(indirizzo, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 5,
    prepare: false,
    connection: {
      application_name: "iqstats-projection",
      default_transaction_read_only: true,
      statement_timeout: 10_000,
      role: "iqstats_app_reader",
    },
    onnotice: () => undefined,
  });
  return cliente;
}

interface RigaIdentificativi {
  readonly season_id: string | null;
  readonly home_team_id: string | null;
  readonly away_team_id: string | null;
  readonly referee_id: string | null;
}

/**
 * Dagli identificativi della fonte a quelli del livello dati.
 *
 * L'arbitro puo' mancare: la fonte non lo dichiara sempre prima della gara, e il profilo
 * d'arbitro e' una famiglia di feature come le altre — se manca, il modello che la usa lo
 * dira' invece di sostituirla con uno zero.
 */
async function identificativi(
  sql: ReturnType<typeof postgres>,
  detail: MatchDetail,
): Promise<GaraDaPrevedere | null> {
  if (detail.homeTeamId === null || detail.awayTeamId === null || detail.seasonId === null) {
    return null;
  }
  const arbitro = detail.refereeId;
  const righe = await sql<RigaIdentificativi[]>`
    select
      (select s.id from football.seasons s
        where s.source_id = ${detail.seasonId}::bigint
        order by s.id limit 1) as season_id,
      (select t.id from football.teams t
        where t.source_id = ${detail.homeTeamId}::bigint) as home_team_id,
      (select t.id from football.teams t
        where t.source_id = ${detail.awayTeamId}::bigint) as away_team_id,
      (select r.id from football.referees r
        where ${arbitro === null ? null : arbitro}::bigint is not null
          and r.source_id = ${arbitro === null ? null : arbitro}::bigint) as referee_id
  `;
  const riga = righe[0];
  if (riga === undefined) return null;
  if (riga.season_id === null || riga.home_team_id === null || riga.away_team_id === null) {
    return null;
  }
  return {
    // L'identificativo della gara serve solo a rompere la parita' fra due gare allo stesso
    // istante, e questa gara non e' ancora nel livello dati: zero non nomina nessuna riga
    // esistente, ed e' minore di ogni identificativo vero.
    matchId: 0,
    seasonId: Number(riga.season_id),
    kickoffAt: detail.kickoff,
    homeTeamId: Number(riga.home_team_id),
    awayTeamId: Number(riga.away_team_id),
    refereeId: riga.referee_id === null ? null : Number(riga.referee_id),
    homeCoachSourceId: detail.homeCoachId,
    awayCoachSourceId: detail.awayCoachId,
    // Il numero della giornata la fonte lo dichiara a parte: si legge quello, e solo se
    // manca si prova a ricavarlo dal nome del turno.
    roundNumber: detail.roundNumber ?? turnoDa(detail.roundName),
    isDerby: detail.isLocalDerby,
  };
}

/** Il numero del turno, quando il nome lo porta. «Turno 12» dà 12, «Ottavi» dà null. */
function turnoDa(nome: string | null): number | null {
  if (nome === null) return null;
  const trovato = nome.match(/(\d+)/);
  if (trovato === null) return null;
  const numero = Number(trovato[1]);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

export interface OsservatoDelBersaglio {
  /** La squadra di casa, nelle sue gare in casa. */
  readonly casa: MediaOsservata | null;
  /** La squadra ospite, nelle sue gare fuori casa. */
  readonly trasferta: MediaOsservata | null;
}

export interface ProiezioniDellaGara {
  readonly bersagli: readonly ProiezioneDiGara[];
  /**
   * Quanto ciascuna squadra ha prodotto davvero, dallo stesso lato del campo, prima di
   * questa gara: il numero osservato accanto a quello previsto.
   */
  readonly osservate: Readonly<Record<string, OsservatoDelBersaglio>>;
  /** Da quando e' aggiornata la storia su cui poggiano queste proiezioni. */
  readonly ultimaOsservazione: string | null;
}

/**
 * Le proiezioni dei bersagli promossi per una gara, o `null` se non se ne puo' fare
 * nessuna.
 *
 * Il materiale si legge **due volte**, una per lato, e si compone sette volte: cambia
 * quale metrica diventa il bersaglio, non quali righe si guardano.
 */
export async function proiezioniDellaGara(
  detail: MatchDetail,
): Promise<ProiezioniDellaGara | null> {
  const sql = connessione();
  if (sql === null) return null;
  if (ARTEFATTI_DI_PRODUZIONE.size === 0) return null;

  try {
    const gara = await identificativi(sql, detail);
    if (gara === null) return null;

    const store = new ProjectionObservationStore(sql);
    const [materialeCasa, materialeTrasferta] = await Promise.all([
      store.materiale(gara, "home"),
      store.materiale(gara, "away"),
    ]);

    const bersagli: ProiezioneDiGara[] = [];
    for (const [target, artefatto] of ARTEFATTI_DI_PRODUZIONE) {
      const colonne = artefatto.feature_schema.ordine as string[];
      const casa = proietta(
        artefatto, calcolaFeature(componiIngresso(materialeCasa, target), colonne),
      );
      const trasferta = proietta(
        artefatto, calcolaFeature(componiIngresso(materialeTrasferta, target), colonne),
      );
      bersagli.push(proiezioneDiGara(artefatto, casa, trasferta));
    }

    // Senza nemmeno un bersaglio completo non c'e' una proiezione: si risponde `null`
    // cosi' chi chiama torna alla lettura di ENG-1. Restituire un oggetto vuoto
    // lascerebbe la pagina senza nessuna delle due sezioni, che e' peggio di entrambe.
    const completi = bersagli.filter(
      (bersaglio) => bersaglio.casa.stato === "prevista"
        && bersaglio.trasferta.stato === "prevista",
    );
    if (completi.length === 0) return null;

    // Gli istanti sono ISO normalizzati dallo store, quindi l'ordine lessicografico e'
    // l'ordine temporale: nessuna conversione a data per trovare il piu' recente.
    const storia = materialeCasa.squadra.concat(materialeTrasferta.squadra);
    const ultima = storia.length === 0
      ? null
      : storia.reduce(
        (piuRecente, riga) => (riga.quando > piuRecente ? riga.quando : piuRecente),
        storia[0].quando,
      );

    // L'osservato costa zero richieste e zero interrogazioni nuove: sono le stesse righe
    // gia' lette per proiettare, contate invece che modellate.
    const osservate: Record<string, OsservatoDelBersaglio> = {};
    for (const bersaglio of completi) {
      osservate[bersaglio.target] = {
        casa: mediaOsservata(materialeCasa.squadra, bersaglio.target, "home", gara.seasonId),
        trasferta: mediaOsservata(
          materialeTrasferta.squadra, bersaglio.target, "away", gara.seasonId,
        ),
      };
    }

    return { bersagli, osservate, ultimaOsservazione: ultima };
  } catch {
    // Una proiezione che non si puo' calcolare non rompe il dossier: la sezione sparisce.
    // Il resto della pagina non dipende da questo livello dati.
    return null;
  }
}
