// Server-only: l'area Arbitri, letta dalle osservazioni squadra-gara.
//
// **Le medie sono nostre.** La fonte pubblica anche le sue, per gara e di carriera: non si
// usano. Qui ogni numero esce dalle righe che abbiamo raccolto, con il campione dichiarato
// accanto, perche' un numero che non sappiamo ricostruire non lo sappiamo nemmeno spiegare.
//
// **Il metro non e' una scala inventata.** Un arbitro si giudica contro i colleghi della
// **sua** competizione, e la sua posizione si dice come posizione: «fischia piu' falli
// dell'82% degli arbitri di questa competizione». Nessuna soglia arbitraria, nessun indice
// centrato su cento: la scala e' la distribuzione vera, e cambia con lei.
//
// **Una gara conta solo se abbiamo entrambe le righe.** Falli e cartellini di una gara sono
// la somma dei due lati: con una riga sola il totale sarebbe dimezzato e nessuno se ne
// accorgerebbe. Le gare a meta' restano fuori dal conto, e il campione lo dichiara.
import "server-only";

import { connessione } from "./lettura.ts";

/** Sotto questo campione un arbitro non entra nel metro: poche gare non fanno una tendenza. */
const GARE_MINIME = 5;

/**
 * Le colonne su cui si puo' ordinare, scritte una per una.
 *
 * La metrica arriva dai parametri dell'indirizzo, quindi non puo' finire in una stringa
 * SQL cosi' com'e': il tipo la vincola quando si compila, questa tabella anche quando gira.
 */
const COLONNA_ORDINE = {
  falli: "a.falli",
  gialli: "a.gialli",
  rossi: "a.rossi",
} as const;

export type MetricaArbitro = keyof typeof COLONNA_ORDINE;

export interface MediaDiGara {
  readonly falli: number;
  readonly gialli: number;
  readonly rossi: number;
}

export interface PosizioneFraColleghi {
  /** Quanti colleghi della stessa competizione fischia piu' di lui, da 0 a 1. */
  readonly quota: number;
  /** Quanti arbitri compongono il metro. */
  readonly colleghi: number;
}

export interface RigaStorico {
  readonly matchSourceId: number | null;
  readonly quando: string;
  readonly casa: string;
  readonly trasferta: string;
  readonly falli: number;
  readonly gialli: number;
  readonly rossi: number;
}

export interface ProfiloArbitro {
  readonly sourceId: number;
  readonly nome: string;
  readonly paese: string | null;
  readonly competizione: string;
  readonly competitionSourceId: number | null;
  readonly gare: number;
  readonly media: MediaDiGara;
  /** Falli fischiati contro la squadra di casa e contro l'ospite: due numeri, non uno. */
  readonly falliControCasa: number;
  readonly falliControTrasferta: number;
  readonly gialliControCasa: number;
  readonly gialliControTrasferta: number;
  /** La media della competizione, sullo stesso campione minimo. */
  readonly metro: MediaDiGara;
  readonly posizioneFalli: PosizioneFraColleghi | null;
  readonly posizioneGialli: PosizioneFraColleghi | null;
  readonly storico: readonly RigaStorico[];
}

export interface RigaClassifica {
  readonly sourceId: number;
  readonly nome: string;
  readonly paese: string | null;
  readonly gare: number;
  readonly falli: number;
  readonly gialli: number;
  readonly rossi: number;
}

export interface CompetizioneConArbitri {
  readonly sourceId: number;
  readonly nome: string;
  readonly paese: string | null;
  readonly arbitri: number;
  readonly gare: number;
}

/**
 * Le gare complete di ogni arbitro, una riga per gara.
 *
 * `having count(*) = 2` e' il filtro che tiene il conto onesto: la gara entra solo quando
 * ci sono tutte e due le squadre.
 */
const PER_GARA = `
  select o.referee_id, o.competition_id, o.match_id,
         sum(o.fouls) as falli,
         sum(o.yellow_cards) as gialli,
         sum(coalesce(o.red_cards_direct, 0) + coalesce(o.second_yellow_red, 0)) as rossi,
         sum(o.fouls) filter (where o.side = 'home') as falli_casa,
         sum(o.fouls) filter (where o.side = 'away') as falli_trasferta,
         sum(o.yellow_cards) filter (where o.side = 'home') as gialli_casa,
         sum(o.yellow_cards) filter (where o.side = 'away') as gialli_trasferta
  from football.team_match_observations o
  where o.referee_id is not null and o.fouls is not null and o.yellow_cards is not null
  group by 1, 2, 3
  having count(*) = 2
`;

interface RigaProfilo {
  readonly source_id: string;
  readonly name: string;
  readonly country_name: string | null;
  readonly competizione: string;
  readonly competition_source_id: string | null;
  readonly gare: string;
  readonly falli: string;
  readonly gialli: string;
  readonly rossi: string;
  readonly falli_casa: string;
  readonly falli_trasferta: string;
  readonly gialli_casa: string;
  readonly gialli_trasferta: string;
  readonly metro_falli: string | null;
  readonly metro_gialli: string | null;
  readonly metro_rossi: string | null;
  readonly colleghi: string | null;
  readonly sotto_falli: string | null;
  readonly sotto_gialli: string | null;
}

interface RigaStoricoDb {
  readonly match_source_id: string | null;
  readonly kickoff_at: string;
  readonly casa: string;
  readonly trasferta: string;
  readonly falli: string;
  readonly gialli: string;
  readonly rossi: string;
}

function numero(valore: string | null): number {
  return valore === null ? 0 : Number(valore);
}

/** Il profilo di un arbitro, o `null` se non lo conosciamo o non ha gare complete. */
export async function profiloArbitro(sourceId: number): Promise<ProfiloArbitro | null> {
  const sql = connessione();
  if (sql === null) return null;

  try {
    const righe = await sql<RigaProfilo[]>`
      with per_gara as (${sql.unsafe(PER_GARA)}),
      per_arbitro as (
        select referee_id, competition_id, count(*) as gare,
               avg(falli) as falli, avg(gialli) as gialli, avg(rossi) as rossi,
               avg(falli_casa) as falli_casa, avg(falli_trasferta) as falli_trasferta,
               avg(gialli_casa) as gialli_casa, avg(gialli_trasferta) as gialli_trasferta
        from per_gara group by 1, 2
      ),
      -- La competizione dell'arbitro e' quella in cui ha diretto di piu': 586 arbitri su
      -- 681 ne hanno una sola, e per gli altri il metro giusto e' quella principale.
      principale as (
        select distinct on (referee_id) *
        from per_arbitro order by referee_id, gare desc, competition_id
      ),
      metro as (
        select competition_id, count(*) as colleghi,
               avg(falli) as falli, avg(gialli) as gialli, avg(rossi) as rossi
        from per_arbitro where gare >= ${GARE_MINIME} group by 1
      )
      select r.source_id::text, r.name, r.country_name,
             c.name as competizione, c.source_id::text as competition_source_id,
             p.gare::text, p.falli::text, p.gialli::text, p.rossi::text,
             p.falli_casa::text, p.falli_trasferta::text,
             p.gialli_casa::text, p.gialli_trasferta::text,
             m.falli::text as metro_falli, m.gialli::text as metro_gialli,
             m.rossi::text as metro_rossi, m.colleghi::text as colleghi,
             (select count(*) from per_arbitro q
               where q.competition_id = p.competition_id and q.gare >= ${GARE_MINIME}
                 and q.falli < p.falli)::text as sotto_falli,
             (select count(*) from per_arbitro q
               where q.competition_id = p.competition_id and q.gare >= ${GARE_MINIME}
                 and q.gialli < p.gialli)::text as sotto_gialli
      from principale p
      join football.referees r on r.id = p.referee_id
      join football.competitions c on c.id = p.competition_id
      left join metro m on m.competition_id = p.competition_id
      where r.source_id = ${sourceId}::bigint
    `;

    const riga = righe[0];
    if (riga === undefined) return null;

    const storico = await sql<RigaStoricoDb[]>`
      with per_gara as (${sql.unsafe(PER_GARA)})
      select g.source_id::text as match_source_id, g.kickoff_at::text,
             casa.name as casa, ospite.name as trasferta,
             p.falli::text, p.gialli::text, p.rossi::text
      from per_gara p
      join football.referees r on r.id = p.referee_id
      join football.matches g on g.id = p.match_id
      join football.teams casa on casa.id = g.home_team_id
      join football.teams ospite on ospite.id = g.away_team_id
      where r.source_id = ${sourceId}::bigint
      order by g.kickoff_at desc
      limit 20
    `;

    const colleghi = riga.colleghi === null ? 0 : Number(riga.colleghi);
    const posizione = (sotto: string | null): PosizioneFraColleghi | null =>
      colleghi < 3 || sotto === null ? null : { quota: Number(sotto) / colleghi, colleghi };

    return {
      sourceId,
      nome: riga.name,
      paese: riga.country_name,
      competizione: riga.competizione,
      competitionSourceId: riga.competition_source_id === null
        ? null : Number(riga.competition_source_id),
      gare: Number(riga.gare),
      media: {
        falli: numero(riga.falli), gialli: numero(riga.gialli), rossi: numero(riga.rossi),
      },
      falliControCasa: numero(riga.falli_casa),
      falliControTrasferta: numero(riga.falli_trasferta),
      gialliControCasa: numero(riga.gialli_casa),
      gialliControTrasferta: numero(riga.gialli_trasferta),
      metro: {
        falli: numero(riga.metro_falli),
        gialli: numero(riga.metro_gialli),
        rossi: numero(riga.metro_rossi),
      },
      posizioneFalli: posizione(riga.sotto_falli),
      posizioneGialli: posizione(riga.sotto_gialli),
      storico: storico.map((s) => ({
        matchSourceId: s.match_source_id === null ? null : Number(s.match_source_id),
        quando: s.kickoff_at,
        casa: s.casa,
        trasferta: s.trasferta,
        falli: numero(s.falli),
        gialli: numero(s.gialli),
        rossi: numero(s.rossi),
      })),
    };
  } catch {
    // Una pagina che non si puo' leggere non diventa una pagina inventata.
    return null;
  }
}

/** Le competizioni che hanno arbitri con abbastanza gare, dalla più coperta in giù. */
export async function competizioniConArbitri(): Promise<readonly CompetizioneConArbitri[]> {
  const sql = connessione();
  if (sql === null) return [];
  try {
    const righe = await sql<Array<{
      source_id: string | null; name: string; country_name: string | null;
      arbitri: string; gare: string;
    }>>`
      with per_gara as (${sql.unsafe(PER_GARA)}),
      per_arbitro as (
        select referee_id, competition_id, count(*) as gare from per_gara group by 1, 2
      )
      select c.source_id::text, c.name, c.country_name,
             count(*)::text as arbitri, sum(a.gare)::text as gare
      from per_arbitro a
      join football.competitions c on c.id = a.competition_id
      where a.gare >= ${GARE_MINIME}
      group by 1, 2, 3
      having count(*) >= 3
      order by count(*) desc, c.name
    `;
    return righe
      .filter((r) => r.source_id !== null)
      .map((r) => ({
        sourceId: Number(r.source_id),
        nome: r.name,
        paese: r.country_name,
        arbitri: Number(r.arbitri),
        gare: Number(r.gare),
      }));
  } catch {
    return [];
  }
}

/** La classifica degli arbitri di una competizione, ordinata per la metrica scelta. */
export async function classificaArbitri(
  competitionSourceId: number,
  metrica: MetricaArbitro,
): Promise<readonly RigaClassifica[]> {
  const sql = connessione();
  if (sql === null) return [];
  try {
    const righe = await sql<Array<{
      source_id: string; name: string; country_name: string | null;
      gare: string; falli: string; gialli: string; rossi: string;
    }>>`
      with per_gara as (${sql.unsafe(PER_GARA)}),
      per_arbitro as (
        select referee_id, competition_id, count(*) as gare,
               avg(falli) as falli, avg(gialli) as gialli, avg(rossi) as rossi
        from per_gara group by 1, 2
      )
      select r.source_id::text, r.name, r.country_name,
             a.gare::text, a.falli::text, a.gialli::text, a.rossi::text
      from per_arbitro a
      join football.referees r on r.id = a.referee_id
      join football.competitions c on c.id = a.competition_id
      where c.source_id = ${competitionSourceId}::bigint and a.gare >= ${GARE_MINIME}
      order by ${sql.unsafe(COLONNA_ORDINE[metrica] ?? COLONNA_ORDINE.gialli)} desc, a.gare desc
      limit 60
    `;
    return righe.map((r) => ({
      sourceId: Number(r.source_id),
      nome: r.name,
      paese: r.country_name,
      gare: Number(r.gare),
      falli: numero(r.falli),
      gialli: numero(r.gialli),
      rossi: numero(r.rossi),
    }));
  } catch {
    return [];
  }
}
