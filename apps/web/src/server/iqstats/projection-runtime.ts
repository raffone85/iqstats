import "server-only";

import type postgres from "postgres";

import { connessione } from "./lettura.ts";
import { ARTEFATTI_DI_PRODUZIONE } from "./projection-artefatti.ts";
import { calcolaFeature } from "./projection/asof/calcolo.ts";
import { attesiDellaGara, mercatiGol, type MercatiGol } from "./projection/gol.ts";
import { proiezioneDiGara, type ProiezioneDiGara } from "./projection/match.ts";
import { proietta } from "./projection/production.ts";
import { componiIngresso } from "./projection/snapshot.ts";
import type { MaterialeDellaGara, OsservazioneSquadraGara } from "./projection/snapshot.ts";
import type { Lato } from "./projection/asof/contratto.ts";
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
 * **La connessione non e' sua**: vive in `lettura.ts`, condivisa con le altre pagine che
 * leggono il livello dati. Senza la variabile non si proietta e non si finge: la sezione
 * non compare.
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

export interface GolDellaGara {
  readonly mercati: MercatiGol;
  /** Su quante gare poggia ciascuna delle due forze, e il metro di lega. */
  readonly campioneCasa: number;
  readonly campioneTrasferta: number;
  readonly campioneLega: number;
}

export interface ProiezioniDellaGara {
  /** Vuoto quando nessun bersaglio ha storia a sufficienza: la sezione Gol puo' esserci lo stesso. */
  readonly bersagli: readonly ProiezioneDiGara[];
  /**
   * Quanto ciascuna squadra ha prodotto davvero, dallo stesso lato del campo, prima di
   * questa gara: il numero osservato accanto a quello previsto.
   */
  readonly osservate: Readonly<Record<string, OsservatoDelBersaglio>>;
  /** I mercati dei gol, che non dipendono dai modelli: `null` se manca il materiale. */
  readonly gol: GolDellaGara | null;
  /** Da quando e' aggiornata la storia su cui poggiano queste proiezioni. */
  readonly ultimaOsservazione: string | null;
}

/**
 * La media di `expected_goals` sulle righe utili, prodotto o concesso.
 *
 * Gemella di `mediaOsservata`, che guarda solo il prodotto: qui serve anche il concesso,
 * perche' i gol attesi di una squadra dipendono da quanto l'altra ne lascia fare. Stessi
 * due vincoli, lato e stagione, per la stessa ragione.
 */
function mediaXg(
  righe: readonly OsservazioneSquadraGara[],
  verso: "prodotte" | "concesse",
  lato: Lato,
  stagione: number,
): { media: number; campione: number } | null {
  let somma = 0;
  let campione = 0;
  for (const riga of righe) {
    if (riga.lato !== lato || riga.stagione !== stagione) continue;
    const valore = riga[verso].expected_goals;
    if (valore === null || valore === undefined) continue;
    somma += valore;
    campione += 1;
  }
  return campione === 0 ? null : { media: somma / campione, campione };
}

/**
 * I gol attesi e i mercati che ne discendono, dal materiale gia' letto per proiettare.
 *
 * Zero interrogazioni nuove: sono le stesse righe. Restituisce `null` appena manca uno dei
 * quattro ingredienti — attacco e difesa delle due squadre — o il metro di lega: una
 * probabilita' costruita su un pezzo mancante e' peggio di una sezione che non compare.
 */
function golDellaGara(
  materialeCasa: MaterialeDellaGara,
  materialeTrasferta: MaterialeDellaGara,
  stagione: number,
): GolDellaGara | null {
  const attaccoCasa = mediaXg(materialeCasa.squadra, "prodotte", "home", stagione);
  const difesaCasa = mediaXg(materialeCasa.squadra, "concesse", "home", stagione);
  const attaccoTrasferta = mediaXg(materialeTrasferta.squadra, "prodotte", "away", stagione);
  const difesaTrasferta = mediaXg(materialeTrasferta.squadra, "concesse", "away", stagione);
  const legaCasa = mediaXg(materialeCasa.lega, "prodotte", "home", stagione);
  const legaTrasferta = mediaXg(materialeCasa.lega, "prodotte", "away", stagione);
  if (
    attaccoCasa === null || difesaCasa === null || attaccoTrasferta === null
    || difesaTrasferta === null || legaCasa === null || legaTrasferta === null
  ) return null;

  const attesi = attesiDellaGara({
    attaccoCasa,
    difesaCasa,
    attaccoTrasferta,
    difesaTrasferta,
    legaCasa: legaCasa.media,
    legaTrasferta: legaTrasferta.media,
  });
  if (attesi === null) return null;

  return {
    mercati: mercatiGol(attesi.casa, attesi.trasferta),
    campioneCasa: attaccoCasa.campione,
    campioneTrasferta: attaccoTrasferta.campione,
    campioneLega: legaCasa.campione + legaTrasferta.campione,
  };
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

    const completi = bersagli.filter(
      (bersaglio) => bersaglio.casa.stato === "prevista"
        && bersaglio.trasferta.stato === "prevista",
    );

    // I gol non passano dai modelli: bastano le medie, quindi la sezione Gol vive anche
    // dove i sette bersagli non arrivano — sotto la quarta giornata, per esempio.
    const gol = golDellaGara(materialeCasa, materialeTrasferta, gara.seasonId);

    // Senza nemmeno un bersaglio completo **e** senza i gol non c'e' niente da mostrare:
    // si risponde `null` cosi' chi chiama torna alla lettura di ENG-1. Con i soli gol si
    // risponde comunque, e chi chiama vede `bersagli` vuoto.
    if (completi.length === 0 && gol === null) return null;

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

    return { bersagli: completi.length === 0 ? [] : bersagli, osservate, gol, ultimaOsservazione: ultima };
  } catch {
    // Una proiezione che non si puo' calcolare non rompe il dossier: la sezione sparisce.
    // Il resto della pagina non dipende da questo livello dati.
    return null;
  }
}
