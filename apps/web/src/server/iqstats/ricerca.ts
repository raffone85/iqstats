// Server-only: la ricerca per nome, dalle nostre righe.
//
// **Solo cio' che ha una pagina.** Squadre e arbitri hanno una scheda; le gare si trovano
// dal calendario, che sa gia' filtrare per giorno, campionato e stato. Un risultato che non
// porta da nessuna parte e' rumore, quindi qui non entra.
//
// **Si cerca dove i nomi vivono davvero**, cioe' nel nostro livello dati, non nella fonte:
// cosi' la ricerca trova esattamente le entita' che le pagine sanno mostrare, e non promette
// una scheda che poi si aprirebbe vuota.
import "server-only";

import { connessione } from "./lettura.ts";

/** Sotto due caratteri qualunque testo somiglia a tutto: non si cerca. */
const MINIMO = 2;

/** Quanti risultati per gruppo. Oltre, la lista smette di essere una risposta. */
const QUANTI = 8;

export interface Trovato {
  readonly sourceId: number;
  readonly nome: string;
  /**
   * Dove l'abbiamo vista: la competizione piu' frequente per una squadra, il paese per un
   * arbitro. Distingue due nomi uguali, e `null` quando non lo sappiamo.
   */
  readonly dove: string | null;
  /** Su quante gare osservate poggia: dice se quella scheda avra' qualcosa da mostrare. */
  readonly gare: number;
}

export interface Risultati {
  readonly squadre: readonly Trovato[];
  readonly arbitri: readonly Trovato[];
}

const VUOTO: Risultati = { squadre: [], arbitri: [] };

/**
 * Le squadre e gli arbitri il cui nome contiene il testo cercato.
 *
 * L'ordine e' per **quante gare abbiamo osservato**, non alfabetico: chi cerca «real» vuole
 * il Real Madrid prima di una squadra di terza divisione con lo stesso aggettivo nel nome, e
 * il numero di gare e' l'unica misura di rilevanza che possediamo davvero.
 */
export async function cerca(testo: string): Promise<Risultati> {
  const pulito = testo.trim();
  if (pulito.length < MINIMO) return VUOTO;
  const sql = connessione();
  if (sql === null) return VUOTO;
  const modello = `%${pulito}%`;

  try {
    const [squadre, arbitri] = await Promise.all([
      sql<Array<{ source_id: string; name: string; dove: string | null; gare: string }>>`
        select t.source_id::text, t.name,
               -- Il paese delle squadre non lo conserviamo: al suo posto la competizione in
               -- cui le abbiamo viste di piu', che distingue gli omonimi ed e' un dato che
               -- abbiamo davvero.
               (select c.name
                  from football.team_match_observations o2
                  join football.competitions c on c.id = o2.competition_id
                 where o2.team_id = t.id
                 group by c.name
                 order by count(*) desc
                 limit 1) as dove,
               count(o.match_id)::text as gare
        from football.teams t
        left join football.team_match_observations o on o.team_id = t.id
        where t.name ilike ${modello}
        group by t.id, t.source_id, t.name
        order by count(o.match_id) desc, t.name
        limit ${QUANTI}
      `,
      sql<Array<{ source_id: string; name: string; dove: string | null; gare: string }>>`
        select r.source_id::text, r.name, r.country_name as dove,
               count(o.match_id)::text as gare
        from football.referees r
        left join football.team_match_observations o on o.referee_id = r.id
        where r.name ilike ${modello}
        group by r.source_id, r.name, r.country_name
        order by count(o.match_id) desc, r.name
        limit ${QUANTI}
      `,
    ]);

    const riga = (r: { source_id: string; name: string; dove: string | null; gare: string }) => ({
      sourceId: Number(r.source_id),
      nome: r.name,
      dove: r.dove,
      // Le gare dell'arbitro si contano per riga squadra-gara: due righe per gara.
      gare: Number(r.gare),
    });
    return { squadre: squadre.map(riga), arbitri: arbitri.map(riga) };
  } catch {
    // Una ricerca che non si puo' fare non diventa una ricerca senza risultati: chi chiama
    // distingue i due casi guardando se la connessione c'e'.
    return VUOTO;
  }
}
