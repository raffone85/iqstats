// Server-only: che cosa troverai davvero aprendo una gara, prima di aprirla.
//
// **Perche' per gara e non per campionato.** Misurato il 24 agosto sul dossier vero: su
// Roma-Atalanta il motore da' i sette attesi ma **zero scale di soglie** e nessun mercato
// gol; su Hull-Aston Villa da' dieci scale e la sezione Gol intera; su NK Celje-Slovan
// non da' niente. Non e' la competizione a decidere: la Roma non ha ancora giocato in casa
// in questa stagione - 19 gare in casa nello storico, zero nella corrente - mentre l'Hull
// City ne ha una. Il motore chiede righe della stagione in corso **dal lato del campo
// giusto**, e un'icona appesa al campionato direbbe «Serie A si» su una gara che dira' no.
//
// **Una interrogazione per tutto il calendario**, non una per gara: si chiedono in blocco
// le squadre che compaiono, e poi ogni gara si risponde da sola.
import "server-only";

import { connessione } from "./lettura.ts";
import type { MatchListItem } from "./matches.ts";

/** Sotto questo campione un arbitro non ha una scheda: la stessa soglia dell'area Arbitri. */
const GARE_ARBITRO = 5;

export interface CoperturaDiGara {
  /** Le scale delle soglie e i mercati dei gol: chiedono la stagione in corso, per lato. */
  readonly proiezione: boolean;
  /** Forma e ritardi: bastano le gare dello storico, in qualunque stagione. */
  readonly storia: boolean;
  /** La scheda dell'arbitro designato, quando c'e' un designato e ha abbastanza gare. */
  readonly arbitro: boolean;
}

interface Riga {
  readonly lega: string;
  readonly squadra: string;
  readonly side: string;
  readonly corrente: string;
  readonly totale: string;
}

function chiave(lega: number | null, squadra: number | null, lato: string): string {
  return `${lega ?? "-"}:${squadra ?? "-"}:${lato}`;
}

/**
 * La copertura di ogni gara dell'elenco, per identificativo della fonte.
 *
 * Senza connessione al livello dati la mappa resta vuota e chi chiama non mostra icone:
 * un'icona spenta direbbe «questa gara non ha proiezione», che e' una cosa diversa da
 * «non lo sappiamo».
 */
export async function coperturaDelleGare(
  gare: readonly MatchListItem[],
): Promise<ReadonlyMap<number, CoperturaDiGara>> {
  const vuota = new Map<number, CoperturaDiGara>();
  const sql = connessione();
  if (sql === null || gare.length === 0) return vuota;

  const squadre = [...new Set(
    gare.flatMap((g) => [g.homeTeamId, g.awayTeamId]).filter((v): v is number => v !== null),
  )];
  const arbitri = [...new Set(
    gare.map((g) => g.refereeId).filter((v): v is number => v !== null),
  )];
  if (squadre.length === 0) return vuota;

  try {
    const righe = await sql<Riga[]>`
      with recente as (
        select competition_id, season_id from (
          select competition_id, season_id,
                 row_number() over (partition by competition_id order by max(kickoff_at) desc) rn
          from football.team_match_observations
          group by 1, 2
        ) t where rn = 1
      )
      select c.source_id::text as lega, t.source_id::text as squadra, o.side,
             count(*) filter (where o.season_id = r.season_id)::text as corrente,
             count(*)::text as totale
      from football.team_match_observations o
      join football.competitions c on c.id = o.competition_id
      join recente r on r.competition_id = o.competition_id
      join football.teams t on t.id = o.team_id
      where t.source_id = any(${squadre}::bigint[])
      group by 1, 2, 3
    `;

    const perLato = new Map<string, { corrente: number; totale: number }>();
    const perSquadra = new Map<string, number>();
    for (const r of righe) {
      perLato.set(`${r.lega}:${r.squadra}:${r.side}`, {
        corrente: Number(r.corrente),
        totale: Number(r.totale),
      });
      const s = r.squadra;
      perSquadra.set(s, (perSquadra.get(s) ?? 0) + Number(r.totale));
    }

    const conScheda = new Set<number>();
    if (arbitri.length > 0) {
      const righeArbitro = await sql<Array<{ source_id: string }>>`
        select r.source_id::text
        from football.referees r
        join football.team_match_observations o on o.referee_id = r.id
        where r.source_id = any(${arbitri}::bigint[])
          and o.fouls is not null and o.yellow_cards is not null
        group by 1
        having count(distinct o.match_id) >= ${GARE_ARBITRO}
      `;
      for (const r of righeArbitro) conScheda.add(Number(r.source_id));
    }

    const fuori = new Map<number, CoperturaDiGara>();
    for (const g of gare) {
      const casa = perLato.get(chiave(g.leagueId, g.homeTeamId, "home"));
      const ospite = perLato.get(chiave(g.leagueId, g.awayTeamId, "away"));
      const storiaCasa = perSquadra.get(String(g.homeTeamId)) ?? 0;
      const storiaOspite = perSquadra.get(String(g.awayTeamId)) ?? 0;
      fuori.set(g.eventId, {
        proiezione: (casa?.corrente ?? 0) > 0 && (ospite?.corrente ?? 0) > 0,
        storia: storiaCasa > 0 && storiaOspite > 0,
        arbitro: g.refereeId !== null && conScheda.has(g.refereeId),
      });
    }
    return fuori;
  } catch {
    return vuota;
  }
}
