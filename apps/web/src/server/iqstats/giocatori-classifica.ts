// Server-only: la classifica di stagione per giocatore, letta dalle nostre osservazioni.
//
// **Quello che questa classifica non ha, e lo dice.** `football.player_match_observations`
// porta sette colonne — minuti, tiri, tiri in porta, falli, gialli, rossi, parate — e
// **non ha i gol**: nel livello dati non esiste nessuna tavola di episodi. Una classifica
// marcatori da qui non si puo' fare, e alla fonte costerebbe una chiamata per gara, cioe'
// trecentottanta per la sola Serie A. Si dichiara l'assenza invece di sostituirla con i
// tiri, che sono un'altra cosa.
//
// **Il denominatore non e' lo stato della gara.** Le 380 gare di Serie A 26/27 in
// `football.matches` sono tutte `scheduled`, comprese le ventiquattro gia' giocate che
// hanno le osservazioni: lo stato non viene aggiornato per la stagione in corso. Le gare
// giocate si contano quindi sull'orario d'inizio, che e' un fatto e non uno stato.
//
// **Il nome del giocatore non sta nel livello dati**, che tiene solo l'identificativo della
// fonte: lo porta chi chiama, dalle rose delle squadre coinvolte, una chiamata per squadra
// e non una per giocatore.
import "server-only";

import { connessione } from "./lettura.ts";

/** Sotto questo campione un giocatore non entra in classifica. */
const GARE_MINIME = 5;
/** Quanti per lettura: una classifica di prodotto e' una cima, non un elenco. */
const QUANTI = 10;

/** Le colonne sono scritte qui una per una: nessun nome di colonna arriva dall'indirizzo. */
export const LETTURE = [
  { chiave: "minuti", colonna: "minutes_played", nome: "Minuti giocati", unita: "minuti" },
  { chiave: "tiri", colonna: "total_shots", nome: "Tiri", unita: "tiri" },
  { chiave: "in_porta", colonna: "shots_on_target", nome: "Tiri in porta", unita: "in porta" },
  { chiave: "falli", colonna: "fouls", nome: "Falli commessi", unita: "falli" },
  { chiave: "gialli", colonna: "yellow_card", nome: "Cartellini gialli", unita: "gialli" },
  { chiave: "parate", colonna: "saves", nome: "Parate", unita: "parate" },
] as const;

export type LetturaGiocatori = (typeof LETTURE)[number]["chiave"];

export interface CompetizioneConGiocatori {
  readonly competizioneSourceId: number;
  readonly stagioneSourceId: number;
  readonly nome: string;
  /** Nome della stagione, o gli anni delle sue gare dove il livello dati ha un segnaposto. */
  readonly stagione: string;
  readonly giocatori: number;
  /** Gare con almeno un'osservazione per giocatore, e gare gia' iniziate: il rapporto si dichiara. */
  readonly gareConDato: number;
  readonly gareGiocate: number;
}

export interface VoceClassificaGiocatori {
  readonly playerSourceId: number;
  readonly teamSourceId: number;
  readonly squadra: string;
  readonly gare: number;
  readonly minuti: number;
  readonly valore: number;
}

function numero(valore: string | null | undefined): number {
  const n = Number(valore ?? "");
  return Number.isFinite(n) ? n : 0;
}

/**
 * Competizioni e stagioni che hanno abbastanza giocatori per una classifica, dalla piu'
 * popolata. Ognuna dichiara quante gare portano il dato su quelle gia' iniziate.
 */
export async function competizioniConGiocatori(): Promise<readonly CompetizioneConGiocatori[]> {
  const sql = connessione();
  if (sql === null) return [];
  try {
    const righe = await sql<Array<{
      competizione: string | null; stagione_source: string | null;
      nome: string; stagione: string; dal: string | null; al: string | null;
      giocatori: string; gare_con_dato: string; gare_giocate: string;
    }>>`
      with gare as (
        select m.id, m.competition_id, m.season_id, m.kickoff_at,
               (m.kickoff_at < now()) as giocata,
               exists (select 1 from football.player_match_observations o where o.match_id = m.id) as con_dato
        from football.matches m
      )
      select c.source_id::text as competizione, s.source_id::text as stagione_source,
             c.name as nome, s.name as stagione,
             (select count(distinct o.player_source_id)
                from football.player_match_observations o
                join gare g2 on g2.id = o.match_id
               where g2.competition_id = g.competition_id and g2.season_id = g.season_id)::text as giocatori,
             count(*) filter (where g.con_dato)::text as gare_con_dato,
             count(*) filter (where g.giocata)::text as gare_giocate,
             extract(year from min(g.kickoff_at))::text as dal,
             extract(year from max(g.kickoff_at))::text as al
      from gare g
      join football.competitions c on c.id = g.competition_id
      join football.seasons s on s.id = g.season_id
      group by c.source_id, s.source_id, c.name, s.name, g.competition_id, g.season_id
      having count(*) filter (where g.con_dato) >= ${GARE_MINIME}
      order by count(*) filter (where g.con_dato) desc, c.name
    `;
    return righe
      .filter((r) => r.competizione !== null && r.stagione_source !== null)
      .map((r) => ({
        competizioneSourceId: Number(r.competizione),
        stagioneSourceId: Number(r.stagione_source),
        nome: r.nome,
        // Ventotto stagioni su cinquantasette hanno un nome segnaposto nel livello dati:
        // al loro posto vanno gli anni delle gare, che sono un fatto e non un'invenzione.
        // Una stagione dentro un anno solo, come la MLS, non si scrive «2025-2025».
        stagione: r.stagione.includes("segnaposto")
          ? [...new Set([r.dal, r.al].filter(Boolean))].join("-")
          : r.stagione,
        giocatori: numero(r.giocatori),
        gareConDato: numero(r.gare_con_dato),
        gareGiocate: numero(r.gare_giocate),
      }));
  } catch {
    return [];
  }
}

/** I primi dieci di una lettura, dentro una competizione e una stagione sole. */
export async function classificaGiocatori(
  competizioneSourceId: number,
  stagioneSourceId: number,
  lettura: LetturaGiocatori,
): Promise<readonly VoceClassificaGiocatori[]> {
  const sql = connessione();
  if (sql === null) return [];
  const scelta = LETTURE.find((l) => l.chiave === lettura) ?? LETTURE[0];
  try {
    const righe = await sql<Array<{
      player: string; team: string | null; squadra: string | null;
      gare: string; minuti: string; valore: string | null;
    }>>`
      select o.player_source_id::text as player, t.source_id::text as team, t.name as squadra,
             count(*)::text as gare,
             coalesce(sum(o.minutes_played), 0)::text as minuti,
             sum(o.${sql.unsafe(scelta.colonna)})::text as valore
      from football.player_match_observations o
      join football.matches m on m.id = o.match_id
      join football.competitions c on c.id = m.competition_id
      join football.seasons s on s.id = m.season_id
      left join football.teams t on t.id = o.team_id
      where c.source_id = ${competizioneSourceId}::bigint
        and s.source_id = ${stagioneSourceId}::bigint
      group by 1, 2, 3
      having count(*) >= ${GARE_MINIME} and sum(o.${sql.unsafe(scelta.colonna)}) > 0
      order by sum(o.${sql.unsafe(scelta.colonna)}) desc, count(*)
      limit ${QUANTI}
    `;
    return righe
      .filter((r) => r.team !== null)
      .map((r) => ({
        playerSourceId: Number(r.player),
        teamSourceId: Number(r.team),
        squadra: r.squadra ?? "squadra non dichiarata",
        gare: numero(r.gare),
        minuti: numero(r.minuti),
        valore: numero(r.valore),
      }));
  } catch {
    return [];
  }
}
