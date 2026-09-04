// Server-only: come stanno in campo le due squadre, e quando spingono.
//
// **Due domande, una fonte.** Dalle stesse risposte gia' archiviate per il motore:
// `average_positions` dice dove sta la squadra, `xg_per_minute` quando produce. Il
// motore legge solo i totali di gara e le scarta entrambe. Nessuna chiamata nuova.
//
// **Solo la stagione in corso**, come «Come si presentano»: una squadra a settembre non
// e' quella di maggio. Qui pero' entrano le gare di **tutti e due i lati**: l'altezza
// della linea e il momento in cui si spinge sono modi di giocare, non proprieta' del
// campo, e dimezzare il campione per il lato lascerebbe una gara sola.
//
// **Sotto tre gare non si dichiara niente.** I numeri si mostrano, la frase che li
// interpreta no: due partite non sono un assetto.
//
// **Anti-leakage.** Finestra `kickoff_at < quando`, come ovunque.
import "server-only";

import { connessione } from "./lettura.ts";

/** Quante gare al massimo entrano nel profilo. */
const GARE = 10;
/** Sotto queste gare non si dichiara un carattere. */
const GARE_PER_UN_CARATTERE = 3;

export interface RigaDiAssetto {
  readonly chiave: string;
  readonly nome: string;
  readonly casa: string;
  readonly trasferta: string;
  /** Quanto pesa la casa sul totale delle due: e' la barra. */
  readonly quotaCasa: number;
}

export interface Assetto {
  readonly nomeCasa: string;
  readonly nomeTrasferta: string;
  readonly gareCasa: number;
  readonly gareTrasferta: number;
  readonly verdetto: string | null;
  readonly righe: readonly RigaDiAssetto[];
}

export interface FasciaDiGara {
  /** 1 = 1-15, 6 = 76 e oltre. */
  readonly band: number;
  readonly etichetta: string;
  readonly casa: number;
  readonly trasferta: number;
  /** Quanto pesa la casa sul totale della fascia. */
  readonly quotaCasa: number;
}

export interface QuandoSpingono {
  readonly nomeCasa: string;
  readonly nomeTrasferta: string;
  readonly gareCasa: number;
  readonly gareTrasferta: number;
  readonly verdetto: string | null;
  readonly fasce: readonly FasciaDiGara[];
}

const ETICHETTE = ["1-15", "16-30", "31-45", "46-60", "61-75", "76-90"] as const;

function numero(valore: string | null | undefined): number | null {
  if (valore === null || valore === undefined) return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

function scritto(valore: number, decimali: number): string {
  return valore.toFixed(decimali).replace(".", ",");
}

/**
 * La riga di un confronto, con la barra.
 *
 * **La barra non e' amplificata, ed e' una scelta.** Due linee a 37,9 e 41,0 danno una
 * barra quasi a meta', perche' quelle due squadre stanno quasi alla stessa altezza:
 * allargare lo scarto per farlo vedere direbbe che la differenza e' grande quando non lo
 * e'. Il segnale sta nella frase in cima, che si dichiara solo quando lo scarto supera
 * l'errore delle due medie; la barra accompagna i numeri, non li interpreta.
 */
function riga(
  chiave: string,
  nome: string,
  a: number | null,
  b: number | null,
  decimali: number,
): RigaDiAssetto | null {
  if (a === null || b === null) return null;
  const totale = Math.abs(a) + Math.abs(b);
  return {
    chiave,
    nome,
    casa: scritto(a, decimali),
    trasferta: scritto(b, decimali),
    quotaCasa: totale === 0 ? 0.5 : Math.abs(a) / totale,
  };
}

/**
 * La frase dell'assetto: si dichiara solo quando la differenza fra le due linee supera
 * l'errore delle due medie messo insieme. Sotto, due squadre che difendono alla stessa
 * altezza sembrerebbero diverse per il capriccio di una partita.
 */
export function verdettoDiAssetto(
  nomeCasa: string,
  nomeTrasferta: string,
  lineaCasa: number | null,
  lineaTrasferta: number | null,
  erroreCasa: number | null,
  erroreTrasferta: number | null,
  gareCasa: number,
  gareTrasferta: number,
): string | null {
  if (gareCasa < GARE_PER_UN_CARATTERE || gareTrasferta < GARE_PER_UN_CARATTERE) return null;
  if (lineaCasa === null || lineaTrasferta === null) return null;
  if (erroreCasa === null || erroreTrasferta === null) return null;
  const scarto = lineaCasa - lineaTrasferta;
  if (Math.abs(scarto) <= erroreCasa + erroreTrasferta) {
    return "Le due squadre stanno in campo alla stessa altezza";
  }
  return scarto > 0
    ? `${nomeCasa} alza la linea, ${nomeTrasferta} difende più basso`
    : `${nomeTrasferta} alza la linea, ${nomeCasa} difende più basso`;
}

/** La frase delle fasce: nomina il quarto d'ora piu' produttivo di ciascuna. */
export function verdettoDelleFasce(
  nomeCasa: string,
  nomeTrasferta: string,
  fasce: readonly FasciaDiGara[],
  gareCasa: number,
  gareTrasferta: number,
): string | null {
  if (gareCasa < GARE_PER_UN_CARATTERE || gareTrasferta < GARE_PER_UN_CARATTERE) return null;
  if (fasce.length === 0) return null;
  const piccoCasa = [...fasce].sort((a, b) => b.casa - a.casa)[0];
  const piccoFuori = [...fasce].sort((a, b) => b.trasferta - a.trasferta)[0];
  return piccoCasa.band === piccoFuori.band
    ? `Le due squadre producono di più nello stesso tratto, ${piccoCasa.etichetta}`
    : `${nomeCasa} produce di più fra ${piccoCasa.etichetta}, ${nomeTrasferta} fra ${piccoFuori.etichetta}`;
}

interface Profilo {
  readonly nome: string;
  readonly gare: number;
  readonly linea: number | null;
  readonly errore: number | null;
  readonly profondita: number | null;
  readonly ampiezza: number | null;
}

async function profiloDi(
  sql: NonNullable<ReturnType<typeof connessione>>,
  teamSourceId: number,
  seasonSourceId: number,
  quando: string,
): Promise<Profilo | null> {
  const righe = await sql<Record<string, string | null>[]>`
    with ultime as (
      select h.linea_difensiva, h.profondita, h.ampiezza
      from football.team_match_shape h
      join football.teams t on t.id = h.team_id
      join football.matches m on m.id = h.match_id
      join football.seasons s on s.id = m.season_id
      where t.source_id = ${teamSourceId}::bigint
        and s.source_id = ${seasonSourceId}::bigint
        and h.kickoff_at < ${quando}::timestamptz
      order by h.kickoff_at desc
      limit ${GARE}
    )
    select count(*)::text as gare,
           avg(linea_difensiva)::text as linea,
           stddev_samp(linea_difensiva)::text as sd,
           avg(profondita)::text as profondita,
           avg(ampiezza)::text as ampiezza,
           (select name from football.teams where source_id = ${teamSourceId}::bigint) as nome
    from ultime
  `;
  const r = righe[0];
  if (r === undefined) return null;
  const gare = numero(r.gare) ?? 0;
  if (gare === 0) return null;
  const sd = numero(r.sd);
  return {
    nome: r.nome ?? "",
    gare,
    linea: numero(r.linea),
    errore: sd === null || gare < 2 ? null : sd / Math.sqrt(gare),
    profondita: numero(r.profondita),
    ampiezza: numero(r.ampiezza),
  };
}

/** Come stanno in campo le due squadre in questa stagione. */
export async function assettoDelConfronto(
  casaSourceId: number,
  trasfertaSourceId: number,
  seasonSourceId: number,
  quando: string,
): Promise<Assetto | null> {
  const sql = connessione();
  if (sql === null) return null;
  try {
    const [casa, fuori] = await Promise.all([
      profiloDi(sql, casaSourceId, seasonSourceId, quando),
      profiloDi(sql, trasfertaSourceId, seasonSourceId, quando),
    ]);
    if (casa === null || fuori === null) return null;

    const righe = [
      riga("linea", "altezza della linea", casa.linea, fuori.linea, 1),
      riga("profondita", "distanza difesa-attacco", casa.profondita, fuori.profondita, 1),
      riga("ampiezza", "quanto si allargano", casa.ampiezza, fuori.ampiezza, 1),
    ].filter((r): r is RigaDiAssetto => r !== null);
    if (righe.length === 0) return null;

    return {
      nomeCasa: casa.nome,
      nomeTrasferta: fuori.nome,
      gareCasa: casa.gare,
      gareTrasferta: fuori.gare,
      verdetto: verdettoDiAssetto(
        casa.nome, fuori.nome, casa.linea, fuori.linea,
        casa.errore, fuori.errore, casa.gare, fuori.gare,
      ),
      righe,
    };
  } catch {
    // Un assetto che non si riesce a leggere non diventa un assetto inventato.
    return null;
  }
}

async function fasceDi(
  sql: NonNullable<ReturnType<typeof connessione>>,
  teamSourceId: number,
  seasonSourceId: number,
  quando: string,
): Promise<{ nome: string; gare: number; xg: Map<number, number> } | null> {
  const righe = await sql<Record<string, string | null>[]>`
    with ultime as (
      select distinct b.match_id, b.kickoff_at
      from football.team_match_bands b
      join football.teams t on t.id = b.team_id
      join football.matches m on m.id = b.match_id
      join football.seasons s on s.id = m.season_id
      where t.source_id = ${teamSourceId}::bigint
        and s.source_id = ${seasonSourceId}::bigint
        and b.kickoff_at < ${quando}::timestamptz
      order by b.kickoff_at desc
      limit ${GARE}
    )
    select b.band::text as band,
           avg(b.expected_goals)::text as xg,
           count(distinct b.match_id)::text as gare,
           (select name from football.teams where source_id = ${teamSourceId}::bigint) as nome
    from football.team_match_bands b
    join football.teams t on t.id = b.team_id
    join ultime u on u.match_id = b.match_id
    where t.source_id = ${teamSourceId}::bigint
    group by 1, 4
    order by 1
  `;
  if (righe.length === 0) return null;
  const xg = new Map<number, number>();
  let gare = 0;
  for (const r of righe) {
    const band = numero(r.band);
    const valore = numero(r.xg);
    gare = Math.max(gare, numero(r.gare) ?? 0);
    if (band !== null && valore !== null) xg.set(band, valore);
  }
  if (xg.size === 0) return null;
  return { nome: righe[0].nome ?? "", gare, xg };
}

/** In quale tratto della gara le due squadre producono di piu'. */
export async function quandoSpingono(
  casaSourceId: number,
  trasfertaSourceId: number,
  seasonSourceId: number,
  quando: string,
): Promise<QuandoSpingono | null> {
  const sql = connessione();
  if (sql === null) return null;
  try {
    const [casa, fuori] = await Promise.all([
      fasceDi(sql, casaSourceId, seasonSourceId, quando),
      fasceDi(sql, trasfertaSourceId, seasonSourceId, quando),
    ]);
    if (casa === null || fuori === null) return null;

    const fasce: FasciaDiGara[] = [];
    for (let band = 1; band <= 6; band += 1) {
      const a = casa.xg.get(band);
      const b = fuori.xg.get(band);
      if (a === undefined || b === undefined) continue;
      const totale = a + b;
      fasce.push({
        band,
        etichetta: ETICHETTE[band - 1],
        casa: a,
        trasferta: b,
        quotaCasa: totale === 0 ? 0.5 : a / totale,
      });
    }
    if (fasce.length === 0) return null;

    return {
      nomeCasa: casa.nome,
      nomeTrasferta: fuori.nome,
      gareCasa: casa.gare,
      gareTrasferta: fuori.gare,
      verdetto: verdettoDelleFasce(casa.nome, fuori.nome, fasce, casa.gare, fuori.gare),
      fasce,
    };
  } catch {
    // Una fascia che non si riesce a leggere non diventa una fascia inventata.
    return null;
  }
}
