// Server-only: il materiale per accoppiare due squadre che non si incontrano.
//
// **Expected ha un mestiere solo, ed e' diverso dal dossier.** Il dossier legge una gara
// che esiste in calendario; qui si sceglie chi contro chi, e l'arbitro. Il motore e' lo
// stesso: `proiezioniDellaGara` ha sempre saputo proiettare una gara che nel livello dati
// non c'e', e da oggi chiede solo i nove campi che usa invece di un dettaglio della fonte.
//
// **Non si chiama la fonte.** Squadre, stagione e arbitri escono dalle nostre osservazioni,
// come per l'area Arbitri e per l'area Squadre: e' la regola del piano, e qui varrebbe
// doppio, perche' una pagina di prova puo' essere aperta molte volte di seguito.
import "server-only";

import { connessione } from "./lettura.ts";

/** Sotto questo campione una squadra non entra fra le scelte: non c'e' storia da leggere. */
const GARE_MINIME = 4;

export interface SquadraScelta {
  readonly sourceId: number;
  readonly nome: string;
  /** Quante gare di questa stagione abbiamo per lei. */
  readonly gare: number;
}

export interface ContestoExpected {
  /** L'identificativo di stagione che il motore si aspetta, non il nostro interno. */
  readonly seasonSourceId: number;
  readonly stagione: string | null;
  readonly squadre: readonly SquadraScelta[];
}

/**
 * Le squadre di una competizione nella sua stagione piu' recente, e quella stagione.
 *
 * La stagione e' **una sola e la piu' recente**: accostare una squadra della stagione
 * scorsa a una di quella corrente confronterebbe due mondi diversi, e il metro di lega da
 * cui nascono i gol attesi e' quello di una stagione sola.
 */
export async function contestoExpected(
  competitionSourceId: number,
): Promise<ContestoExpected | null> {
  const sql = connessione();
  if (sql === null) return null;
  try {
    const righe = await sql<Array<{
      season_source_id: string | null; stagione: string | null;
      team_source_id: string | null; nome: string; gare: string;
    }>>`
      with competizione as (
        select id from football.competitions where source_id = ${competitionSourceId}::bigint
      ),
      recente as (
        select o.season_id
        from football.team_match_observations o
        join competizione c on c.id = o.competition_id
        group by o.season_id
        order by max(o.kickoff_at) desc
        limit 1
      )
      select s.source_id::text as season_source_id, s.name as stagione,
             t.source_id::text as team_source_id, t.name as nome,
             count(*)::text as gare
      from football.team_match_observations o
      join recente r on r.season_id = o.season_id
      join competizione c on c.id = o.competition_id
      join football.teams t on t.id = o.team_id
      join football.seasons s on s.id = o.season_id
      group by 1, 2, 3, 4
      having count(*) >= ${GARE_MINIME}
      order by t.name
    `;

    const prima = righe[0];
    if (prima === undefined || prima.season_source_id === null) return null;

    const squadre = righe
      .filter((r) => r.team_source_id !== null)
      .map((r) => ({
        sourceId: Number(r.team_source_id),
        nome: r.nome,
        gare: Number(r.gare),
      }));
    // Con una squadra sola non c'e' niente da accoppiare: la pagina lo dichiara.
    if (squadre.length < 2) return null;

    return {
      seasonSourceId: Number(prima.season_source_id),
      stagione: prima.stagione,
      squadre,
    };
  } catch {
    return null;
  }
}
