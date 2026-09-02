// Server-only: la gara divisa in due tempi.
//
// **Che cosa esiste davvero, misurato il 2 settembre 2026.** Delle trentotto metriche che
// osserviamo per gara **nessuna e' divisa per tempo**: tiri, corner, falli e il resto
// esistono solo sul totale. Quello che esiste, ed e' coperto sul 100% delle gare finite
// campionate, e' il **punteggio all'intervallo** - `home_score_halftime` e
// `away_score_halftime` in `football.matches` - da cui si ricavano i gol del primo tempo e,
// per differenza, quelli del secondo.
//
// Quindi qui si costruisce tutto e solo cio' che i gol per tempo permettono. Le fasce
// 46-60, 61-75 e 76-90 chiedono il **minuto** di ogni gol: sta negli episodi, che sono sul
// disco per l'addestramento e non nel livello dati che l'applicazione legge a richiesta.
// Non si stimano: si dichiarano assenti.
//
// **Nessuna chiamata nuova alla fonte.** Una sola interrogazione al nostro livello dati,
// gia' aperto per il motore e per gli arbitri, e l'aggregazione avviene qui.
//
// **Anti-leakage.** La finestra e' `kickoff_at < quando`, la stessa regola del motore: la
// gara da leggere non entra mai nelle medie che la leggono.
import "server-only";

import { connessione } from "./lettura.ts";
import { mercatiGol, type MercatiGol } from "./projection/gol.ts";

/** Quante gare al massimo si guardano indietro. Oltre, si guarda un'altra stagione. */
const MAX_GARE = 400;
/** Sotto queste gare una quota non si mostra: e' una frequenza, non una tendenza. */
const MIN_GARE = 4;

export type Meta = "primo" | "secondo";

export interface MedieDelTempo {
  readonly gare: number;
  /** Gol segnati e subiti dalla squadra in quel tempo, per gara. */
  readonly segnati: number;
  readonly subiti: number;
  /** Quota di gare in cui in quel tempo si e' segnato almeno un gol, da chiunque. */
  readonly conGol: number;
  /** Quota di gare con almeno due gol in quel tempo. */
  readonly overUnoCinque: number;
  /** Quota di gare in cui in quel tempo hanno segnato entrambe. */
  readonly entrambe: number;
}

/** Come si e' chiuso il primo tempo, dal punto di vista della squadra. */
export interface EsitiAllIntervallo {
  readonly avanti: number;
  readonly pari: number;
  readonly sotto: number;
}

export interface TempiDiSquadra {
  readonly nome: string;
  readonly lato: "casa" | "trasferta";
  readonly stagione: Readonly<Record<Meta, MedieDelTempo>>;
  readonly ultime5: Readonly<Record<Meta, MedieDelTempo>> | null;
  readonly ultime10: Readonly<Record<Meta, MedieDelTempo>> | null;
  readonly intervallo: EsitiAllIntervallo | null;
}

export interface TempiDellaGara {
  readonly casa: TempiDiSquadra;
  readonly trasferta: TempiDiSquadra;
  /** Il metro del campionato, sulle stesse gare e nella stessa finestra. */
  readonly lega: Readonly<Record<Meta, MedieDelTempo>>;
  readonly gareDiLega: number;
  /**
   * I mercati dei due tempi, dalla **stessa** funzione che produce quelli della gara
   * intera: nessun secondo motore dei gol, solo attesi diversi in ingresso.
   * `null` dove il campione non regge.
   */
  readonly mercati: Readonly<Record<Meta, MercatiGol | null>>;
  /** Le fasce del secondo tempo non si possono misurare: il minuto del gol non e' qui. */
  readonly fasce: "DATA_NOT_AVAILABLE";
}

export interface RigaGara {
  readonly quando: string;
  readonly casaId: number;
  readonly trasfertaId: number;
  readonly golCasa: number;
  readonly golTrasferta: number;
  readonly golCasaPt: number;
  readonly golTrasfertaPt: number;
}

/**
 * Le sole gare chiuse **prima** di quella da leggere.
 *
 * Il filtro c'e' gia' nella query, e questo lo ripete a valle: costa un confronto per riga
 * e toglie di mezzo l'unico errore che in questo dominio non si vede mai a occhio, perche'
 * un numero calcolato anche sulla gara da prevedere sembra giusto e non lo e'. Si prova da
 * sola, senza database.
 */
export function primaDi(righe: readonly RigaGara[], quando: string): RigaGara[] {
  const soglia = Date.parse(quando);
  if (!Number.isFinite(soglia)) return [];
  return righe.filter((r) => {
    const suo = Date.parse(r.quando);
    return Number.isFinite(suo) && suo < soglia;
  });
}

/** I gol di un tempo, dal punteggio all'intervallo e da quello finale. */
export function golDelTempo(riga: RigaGara, meta: Meta): { casa: number; trasferta: number } {
  return meta === "primo"
    ? { casa: riga.golCasaPt, trasferta: riga.golTrasfertaPt }
    : { casa: riga.golCasa - riga.golCasaPt, trasferta: riga.golTrasferta - riga.golTrasfertaPt };
}

export function medie(righe: readonly RigaGara[], meta: Meta, squadra: number | null): MedieDelTempo {
  const gare = righe.length;
  if (gare === 0) {
    return { gare: 0, segnati: 0, subiti: 0, conGol: 0, overUnoCinque: 0, entrambe: 0 };
  }
  let segnati = 0;
  let subiti = 0;
  let conGol = 0;
  let overUnoCinque = 0;
  let entrambe = 0;
  for (const riga of righe) {
    const g = golDelTempo(riga, meta);
    const totale = g.casa + g.trasferta;
    if (totale >= 1) conGol += 1;
    if (totale >= 2) overUnoCinque += 1;
    if (g.casa >= 1 && g.trasferta >= 1) entrambe += 1;
    if (squadra === null) {
      // Il metro di lega guarda la gara, non un lato: qui «segnati» e' il totale.
      segnati += totale;
    } else {
      const suo = riga.casaId === squadra ? g.casa : g.trasferta;
      const altrui = riga.casaId === squadra ? g.trasferta : g.casa;
      segnati += suo;
      subiti += altrui;
    }
  }
  const su = (n: number) => Math.round((n / gare) * 10000) / 10000;
  return {
    gare,
    segnati: Math.round((segnati / gare) * 1000) / 1000,
    subiti: Math.round((subiti / gare) * 1000) / 1000,
    conGol: su(conGol),
    overUnoCinque: su(overUnoCinque),
    entrambe: su(entrambe),
  };
}

function perTempo(
  righe: readonly RigaGara[],
  squadra: number | null,
): Readonly<Record<Meta, MedieDelTempo>> {
  return { primo: medie(righe, "primo", squadra), secondo: medie(righe, "secondo", squadra) };
}

export function esitiAllIntervallo(
  righe: readonly RigaGara[],
  squadra: number,
): EsitiAllIntervallo | null {
  if (righe.length < MIN_GARE) return null;
  let avanti = 0;
  let pari = 0;
  let sotto = 0;
  for (const riga of righe) {
    const suo = riga.casaId === squadra ? riga.golCasaPt : riga.golTrasfertaPt;
    const altrui = riga.casaId === squadra ? riga.golTrasfertaPt : riga.golCasaPt;
    if (suo > altrui) avanti += 1;
    else if (suo === altrui) pari += 1;
    else sotto += 1;
  }
  const su = (n: number) => Math.round((n / righe.length) * 10000) / 10000;
  return { avanti: su(avanti), pari: su(pari), sotto: su(sotto) };
}

/**
 * Gli attesi di un tempo, con lo stesso schema di forza usato per la gara intera: quanto
 * la squadra produce in quel tempo, corretto da quanto l'avversaria concede, sul metro
 * del campionato. Nessuna formula nuova: cambia solo che cosa si mette dentro.
 */
export function attesiDelTempo(
  casa: MedieDelTempo,
  trasferta: MedieDelTempo,
  lega: MedieDelTempo,
): { casa: number; trasferta: number } | null {
  if (casa.gare < MIN_GARE || trasferta.gare < MIN_GARE || lega.gare < MIN_GARE) return null;
  const mediaLega = lega.segnati / 2;
  if (mediaLega <= 0) return null;
  const attaccoCasa = casa.segnati / mediaLega;
  const difesaTrasferta = trasferta.subiti / mediaLega;
  const attaccoTrasferta = trasferta.segnati / mediaLega;
  const difesaCasa = casa.subiti / mediaLega;
  const attesiCasa = attaccoCasa * difesaTrasferta * mediaLega;
  const attesiTrasferta = attaccoTrasferta * difesaCasa * mediaLega;
  if (!Number.isFinite(attesiCasa) || !Number.isFinite(attesiTrasferta)) return null;
  if (attesiCasa <= 0 || attesiTrasferta <= 0) return null;
  return { casa: attesiCasa, trasferta: attesiTrasferta };
}

/**
 * I due tempi di una gara che deve ancora giocarsi.
 *
 * `null` quando il livello dati non risponde, quando la competizione non ha abbastanza
 * gare chiuse prima di questa, o quando manca uno degli identificativi: senza uno di
 * quelli non c'e' niente da misurare, e mezza misura non si mostra.
 */
export async function tempiDellaGara(args: {
  readonly leagueId: number | null;
  readonly seasonId: number | null;
  readonly homeTeamId: number | null;
  readonly awayTeamId: number | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffAt: string;
}): Promise<TempiDellaGara | null> {
  const { leagueId, seasonId, homeTeamId, awayTeamId, kickoffAt } = args;
  if (leagueId === null || seasonId === null || homeTeamId === null || awayTeamId === null) {
    return null;
  }
  const sql = connessione();
  if (sql === null) return null;

  const righe = await sql<
    {
      quando: string;
      casa_id: string;
      trasferta_id: string;
      gol_casa: string;
      gol_trasferta: string;
      gol_casa_pt: string;
      gol_trasferta_pt: string;
    }[]
  >`
    select g.kickoff_at::text as quando,
           casa.source_id::text as casa_id,
           ospite.source_id::text as trasferta_id,
           g.home_score::text as gol_casa,
           g.away_score::text as gol_trasferta,
           g.home_score_halftime::text as gol_casa_pt,
           g.away_score_halftime::text as gol_trasferta_pt
    from football.matches g
    join football.competitions c on c.id = g.competition_id
    join football.teams casa on casa.id = g.home_team_id
    join football.teams ospite on ospite.id = g.away_team_id
    where c.source_id = ${leagueId}::bigint
      and g.season_id = (select id from football.seasons where source_id = ${seasonId}::bigint)
      and g.normalized_status = 'finished'
      and g.home_score is not null and g.away_score is not null
      and g.home_score_halftime is not null and g.away_score_halftime is not null
      and g.kickoff_at < ${kickoffAt}::timestamptz
    order by g.kickoff_at desc
    limit ${MAX_GARE}
  `;

  const gare: RigaGara[] = righe
    .map((r) => ({
      quando: r.quando,
      casaId: Number(r.casa_id),
      trasfertaId: Number(r.trasferta_id),
      golCasa: Number(r.gol_casa),
      golTrasferta: Number(r.gol_trasferta),
      golCasaPt: Number(r.gol_casa_pt),
      golTrasfertaPt: Number(r.gol_trasferta_pt),
    }))
    .filter((g) =>
      [g.casaId, g.trasfertaId, g.golCasa, g.golTrasferta, g.golCasaPt, g.golTrasfertaPt]
        .every(Number.isFinite),
    );
  const ammesse = primaDi(gare, kickoffAt);
  if (ammesse.length < MIN_GARE) return null;

  // Il lato conta: la casa si legge dalle sue gare in casa, l'ospite dalle sue in trasferta.
  const dellaCasa = ammesse.filter((g) => g.casaId === homeTeamId);
  const dellaTrasferta = ammesse.filter((g) => g.trasfertaId === awayTeamId);
  if (dellaCasa.length === 0 || dellaTrasferta.length === 0) return null;

  const lega = perTempo(ammesse, null);
  const squadra = (
    righeSquadra: readonly RigaGara[],
    id: number,
    nome: string,
    lato: "casa" | "trasferta",
  ): TempiDiSquadra => ({
    nome,
    lato,
    stagione: perTempo(righeSquadra, id),
    ultime5: righeSquadra.length >= 5 ? perTempo(righeSquadra.slice(0, 5), id) : null,
    ultime10: righeSquadra.length >= 10 ? perTempo(righeSquadra.slice(0, 10), id) : null,
    intervallo: esitiAllIntervallo(righeSquadra, id),
  });

  const casa = squadra(dellaCasa, homeTeamId, args.homeTeam, "casa");
  const trasferta = squadra(dellaTrasferta, awayTeamId, args.awayTeam, "trasferta");

  const mercatiDi = (meta: Meta): MercatiGol | null => {
    const attesi = attesiDelTempo(casa.stagione[meta], trasferta.stagione[meta], lega[meta]);
    return attesi === null ? null : mercatiGol(attesi.casa, attesi.trasferta);
  };

  return {
    casa,
    trasferta,
    lega,
    gareDiLega: ammesse.length,
    mercati: { primo: mercatiDi("primo"), secondo: mercatiDi("secondo") },
    fasce: "DATA_NOT_AVAILABLE",
  };
}
