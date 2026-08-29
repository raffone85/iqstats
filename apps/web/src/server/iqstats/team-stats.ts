// Server-only: le statistiche di una squadra e le classifiche, dalle nostre osservazioni.
//
// **Due finestre, e la ragione e' misurata.** Le statistiche descrittive e il Confronto
// poggiano sugli **ultimi 365 giorni**; le classifiche restano dentro **competizione e
// stagione**. Non e' un gusto: sui tiri per gara la variabilita' dentro la stessa squadra
// vale `sd = 4,86`, la differenza vera fra squadre `sd = 2,15`. Con le 7,1 gare medie della
// stagione corrente l'errore della media e' 1,84, cioe' l'85% della differenza che si
// vorrebbe misurare, e 281 squadre su 590 non arrivano nemmeno a cinque gare. Con le 30,9
// gare medie dei 365 giorni l'errore scende a **0,87**, il 40% della differenza vera, e le
// squadre sopra le cinque gare diventano **534 su 590**. Una classifica, invece, e' per
// definizione dentro un torneo e un anno: li' la finestra non si sceglie.
//
// **La finestra si dichiara in pagina**, con la prima e l'ultima gara che la compongono:
// scavalca il confine di stagione, e chi legge deve saperlo.
//
// **Il confronto porta il suo errore.** Due medie diverse non sono due squadre diverse: con
// `sd = 4,86` e otto gare per parte, tre tiri di scarto sono rumore. `differenzaFraSquadre`
// lo dice invece di lasciarlo dedurre.
import "server-only";

import { connessione } from "./lettura.ts";

/** Sotto questo campione un bersaglio non si dichiara. La stessa soglia di `team-metro.ts`. */
const GARE_MINIME = 5;

/** La finestra delle statistiche descrittive, in giorni. */
const FINESTRA_GIORNI = 365;

/**
 * I bersagli, con il gruppo che decide se si vedono subito o dentro il menu' dei dettagli.
 *
 * **Le chiavi sono tutte minuscole**, come in `team-metro.ts`: diventano alias SQL e
 * Postgres abbassa gli identificativi non quotati, quindi `nInPorta` tornerebbe come
 * `ninporta` e la lettura per chiave non lo troverebbe.
 *
 * I dieci principali sono i sette bersagli del motore piu' i gol e i gol attesi: le stesse
 * parole che il dossier, la proiezione e il metro di lega usano gia'. I dieci di dettaglio
 * stanno **nella stessa riga del database** e non costano una richiesta in piu': costano
 * una riga di questa tabella ciascuno.
 */
const BERSAGLI = [
  { chiave: "gol_fatti", colonna: "goals_for", nome: "Gol fatti", gruppo: "principale" },
  { chiave: "gol_subiti", colonna: "goals_against", nome: "Gol subiti", gruppo: "principale" },
  { chiave: "gol_attesi", colonna: "expected_goals", nome: "Gol attesi", gruppo: "principale" },
  { chiave: "tiri", colonna: "total_shots", nome: "Tiri", gruppo: "principale" },
  { chiave: "in_porta", colonna: "shots_on_target", nome: "Tiri in porta", gruppo: "principale" },
  { chiave: "corner", colonna: "corner_kicks", nome: "Corner", gruppo: "principale" },
  { chiave: "falli", colonna: "fouls", nome: "Falli", gruppo: "principale" },
  { chiave: "gialli", colonna: "yellow_cards", nome: "Cartellini gialli", gruppo: "principale" },
  { chiave: "fuorigioco", colonna: "offsides", nome: "Fuorigioco", gruppo: "principale" },
  { chiave: "parate", colonna: "goalkeeper_saves", nome: "Parate", gruppo: "principale" },
  { chiave: "possesso", colonna: "ball_possession", nome: "Possesso", gruppo: "dettaglio",
    percentuale: true },
  { chiave: "tiri_in_area", colonna: "shots_inside_box", nome: "Tiri in area",
    gruppo: "dettaglio" },
  { chiave: "grandi_occasioni", colonna: "big_chances", nome: "Grandi occasioni",
    gruppo: "dettaglio" },
  { chiave: "passaggi", colonna: "passes", nome: "Passaggi", gruppo: "dettaglio" },
  { chiave: "precisione", colonna: "pass_accuracy_pct", nome: "Passaggi riusciti",
    gruppo: "dettaglio", percentuale: true },
  { chiave: "cross", colonna: "crosses_total", nome: "Cross", gruppo: "dettaglio" },
  { chiave: "dribbling", colonna: "dribbles_total", nome: "Dribbling", gruppo: "dettaglio" },
  { chiave: "contrasti", colonna: "tackles", nome: "Contrasti", gruppo: "dettaglio" },
  { chiave: "intercetti", colonna: "interceptions", nome: "Intercetti", gruppo: "dettaglio" },
  { chiave: "duelli", colonna: "duels", nome: "Duelli", gruppo: "dettaglio" },
] as const;

export type ChiaveBersaglio = (typeof BERSAGLI)[number]["chiave"];

/** I bersagli, per chi disegna la pagina: nome, gruppo e unita' stanno qui e non altrove. */
export const BERSAGLI_PUBBLICI: readonly {
  readonly chiave: ChiaveBersaglio;
  readonly nome: string;
  readonly gruppo: "principale" | "dettaglio";
  readonly percentuale: boolean;
}[] = BERSAGLI.map((b) => ({
  chiave: b.chiave,
  nome: b.nome,
  gruppo: b.gruppo,
  percentuale: "percentuale" in b && b.percentuale === true,
}));

export interface VoceStatistica {
  readonly chiave: ChiaveBersaglio;
  readonly nome: string;
  readonly gruppo: "principale" | "dettaglio";
  readonly percentuale: boolean;
  /** Le gare che portano **questo** dato: `avg()` salta i nulli e le colonne non si riempiono insieme. */
  readonly campione: number;
  readonly media: number;
  /** Quanto la squadra varia da gara a gara. Serve a dire se una differenza regge. */
  readonly scarto: number;
}

export interface ProfiloSquadra {
  readonly sourceId: number;
  readonly nome: string;
  /** Le gare nella finestra, non quelle che portano un singolo dato. */
  readonly gare: number;
  /** La prima e l'ultima gara della finestra, per scriverla in pagina invece di sottintenderla. */
  readonly dal: string;
  readonly al: string;
  readonly voci: readonly VoceStatistica[];
  /** I bersagli che questa squadra non porta: si dicono, non spariscono. */
  readonly assenti: readonly string[];
}

export interface DifferenzaFraSquadre {
  /** La media della prima meno quella della seconda. */
  readonly differenza: number;
  /** L'errore standard della differenza, dai due campioni. */
  readonly errore: number;
  /**
   * `true` solo quando lo scarto supera due errori standard.
   *
   * Sotto quella distanza le due squadre non si distinguono con i dati che abbiamo, e
   * mostrare la differenza come se fosse un fatto sarebbe fingere una precisione assente.
   */
  readonly regge: boolean;
}

export interface RigaClassificaSquadre {
  readonly sourceId: number;
  readonly nome: string;
  readonly campione: number;
  readonly media: number;
  /**
   * Quanto la squadra **concede** agli avversari della stessa metrica.
   *
   * Sta accanto a quello che produce perche' una classifica di soli tiri fatti dice meta'
   * della storia: chi ne fa quindici e ne concede cinque e chi ne fa quindici e ne concede
   * venti hanno la stessa riga e due partite diverse. `null` se il dato dell'altro lato
   * manca.
   */
  readonly concessa: number | null;
}

/** Il perimetro della classifica: tutte le gare, o solo quelle di un lato. */
export type PerimetroClassifica = "tutte" | "home" | "away";

export interface CompetizioneConSquadre {
  readonly sourceId: number;
  readonly nome: string;
  readonly paese: string | null;
  /** Le squadre sopra il campione minimo nella stagione piu' recente della competizione. */
  readonly squadre: number;
  /**
   * L'ultima gara che entra in questa classifica.
   *
   * Non e' la data del livello dati: le competizioni non arrivano tutte allo stesso
   * giorno, e la piu' ferma e' indietro di mesi rispetto alla piu' aggiornata. Una data
   * sola per tutte sarebbe vera come massimo e falsa come copertura di questa pagina.
   */
  readonly ultima: string;
}

/** Il numero, o `null` se la colonna non c'era: un'assenza non diventa zero. */
function numero(valore: string | null | undefined): number | null {
  if (valore === null || valore === undefined) return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

/**
 * Quanto due medie distano, e se la distanza regge.
 *
 * Aritmetica pura, senza database: l'errore della media e' `scarto / sqrt(campione)`, quello
 * della differenza e' la radice della somma dei quadrati. Il fattore due e' l'intervallo che
 * si usa per dire «diverse» invece di «diverse in apparenza».
 */
export function differenzaFraSquadre(
  a: VoceStatistica,
  b: VoceStatistica,
): DifferenzaFraSquadre | null {
  if (a.campione < 2 || b.campione < 2) return null;
  const erroreA = a.scarto / Math.sqrt(a.campione);
  const erroreB = b.scarto / Math.sqrt(b.campione);
  const errore = Math.sqrt(erroreA * erroreA + erroreB * erroreB);
  const differenza = a.media - b.media;
  return { differenza, errore, regge: errore > 0 && Math.abs(differenza) > 2 * errore };
}

interface RigaProfilo {
  readonly nome: string;
  readonly gare: string;
  readonly dal: string;
  readonly al: string;
  readonly [colonna: string]: string;
}

export interface LatoDelBersaglio {
  /** Quanto ne produce la squadra da quel lato. */
  readonly prodotto: number | null;
  /** Quanto ne concede all'avversaria da quel lato: e' la riga gemella della stessa gara. */
  readonly subito: number | null;
  /** Le gare che portano questo dato, non quelle giocate. */
  readonly gare: number;
}

export interface VocePerLato {
  readonly chiave: ChiaveBersaglio;
  readonly nome: string;
  readonly gruppo: "principale" | "dettaglio";
  readonly percentuale: boolean;
  readonly casa: LatoDelBersaglio | null;
  readonly trasferta: LatoDelBersaglio | null;
}

export interface ProfiloPerLato {
  readonly nome: string;
  readonly gareCasa: number;
  readonly gareTrasferta: number;
  readonly dal: string;
  readonly al: string;
  readonly voci: readonly VocePerLato[];
}

/**
 * Che cosa fa e che cosa subisce una squadra, **in casa e in trasferta separatamente**.
 *
 * `profiloSquadra` da' i totali di tutte le gare e solo il prodotto. Ma «la Roma subisce
 * 11,8 tiri» non e' un fatto della Roma: e' la media di due popolazioni diverse, e in
 * trasferta il numero e' un altro. E il subito e' meta' del comportamento di una squadra:
 * senza, si sa che cosa fa e non che cosa lascia fare.
 *
 * Il subito e' la riga gemella della stessa gara - `g.team_id = o.opponent_id` - quindi
 * non e' una colonna nuova ne' una richiesta nuova: e' la stessa tavola, unita a se stessa.
 *
 * La finestra e' quella dichiarata dall'utente per le descrittive: 365 giorni.
 */
export async function profiloPerLato(teamSourceId: number): Promise<ProfiloPerLato | null> {
  const sql = connessione();
  if (sql === null) return null;

  // Le colonne sono scritte nella tabella dei bersagli una per una: nessun nome di colonna
  // arriva dall'indirizzo.
  const colonne = BERSAGLI
    .flatMap((b) => [
      "avg(o." + b.colonna + ")::text as p_" + b.chiave,
      "count(o." + b.colonna + ")::text as np_" + b.chiave,
      "avg(g." + b.colonna + ")::text as s_" + b.chiave,
      "count(g." + b.colonna + ")::text as ns_" + b.chiave,
    ])
    .join(", ");

  try {
    const righe = await sql<Array<Record<string, string | null>>>`
      select o.side as lato, t.name as nome,
             count(*)::text as gare,
             min(o.kickoff_at)::text as dal,
             max(o.kickoff_at)::text as al,
             ${sql.unsafe(colonne)}
      from football.team_match_observations o
      join football.team_match_observations g
        on g.match_id = o.match_id and g.team_id = o.opponent_id
      join football.teams t on t.id = o.team_id
      where t.source_id = ${teamSourceId}::bigint
        and o.kickoff_at >= now() - ${FINESTRA_GIORNI}::int * interval '1 day'
      group by o.side, t.name
    `;
    if (righe.length === 0) return null;

    const perLato = new Map(righe.map((r) => [r.lato, r]));
    const casa = perLato.get("home");
    const trasferta = perLato.get("away");
    const prima = righe[0];

    const lato = (
      riga: Record<string, string | null> | undefined,
      chiave: string,
    ): LatoDelBersaglio | null => {
      if (riga === undefined) return null;
      const prodotto = numero(riga["p_" + chiave]);
      const subito = numero(riga["s_" + chiave]);
      const gare = Math.min(numero(riga["np_" + chiave]) ?? 0, numero(riga["ns_" + chiave]) ?? 0);
      // Sotto la soglia non si dichiara niente: una media di due gare racconta due serate.
      if (gare < GARE_MINIME || (prodotto === null && subito === null)) return null;
      return { prodotto, subito, gare };
    };

    const voci: VocePerLato[] = [];
    for (const b of BERSAGLI) {
      const c = lato(casa, b.chiave);
      const t = lato(trasferta, b.chiave);
      if (c === null && t === null) continue;
      voci.push({
        chiave: b.chiave,
        nome: b.nome,
        gruppo: b.gruppo,
        percentuale: "percentuale" in b && b.percentuale === true,
        casa: c,
        trasferta: t,
      });
    }
    if (voci.length === 0) return null;

    const giorni = righe.map((r) => [r.dal ?? "", r.al ?? ""]);
    return {
      nome: prima.nome ?? "",
      gareCasa: numero(casa?.gare ?? null) ?? 0,
      gareTrasferta: numero(trasferta?.gare ?? null) ?? 0,
      dal: giorni.map((g) => g[0]).filter(Boolean).sort()[0] ?? "",
      al: giorni.map((g) => g[1]).filter(Boolean).sort().reverse()[0] ?? "",
      voci,
    };
  } catch {
    return null;
  }
}

/** Il profilo di una squadra sugli ultimi 365 giorni, o `null` se non ne ha abbastanza. */
export async function profiloSquadra(teamSourceId: number): Promise<ProfiloSquadra | null> {
  const sql = connessione();
  if (sql === null) return null;

  // Le colonne sono scritte nella tabella qui sopra una per una: nessun nome di colonna
  // arriva dall'indirizzo.
  const medie = BERSAGLI
    .flatMap((b) => [
      "avg(o." + b.colonna + ")::text as " + b.chiave,
      "count(o." + b.colonna + ")::text as n_" + b.chiave,
      "stddev_samp(o." + b.colonna + ")::text as sd_" + b.chiave,
    ])
    .join(",\n             ");

  try {
    const righe = await sql<RigaProfilo[]>`
      select t.name as nome,
             count(*)::text as gare,
             min(o.kickoff_at)::text as dal,
             max(o.kickoff_at)::text as al,
             ${sql.unsafe(medie)}
      from football.team_match_observations o
      join football.teams t on t.id = o.team_id
      where t.source_id = ${teamSourceId}::bigint
        and o.kickoff_at >= now() - ${FINESTRA_GIORNI}::int * interval '1 day'
      group by t.name
    `;

    const riga = righe[0];
    if (riga === undefined) return null;
    const gare = numero(riga.gare);
    if (gare === null || gare < GARE_MINIME) return null;

    const voci: VoceStatistica[] = [];
    const assenti: string[] = [];
    for (const b of BERSAGLI) {
      const media = numero(riga[b.chiave]);
      const campione = numero(riga["n_" + b.chiave]);
      // `stddev_samp` e' `null` con una riga sola: quel bersaglio non ha ancora una
      // variabilita' da dichiarare, quindi non ha nemmeno un errore da confrontare.
      const scarto = numero(riga["sd_" + b.chiave]);
      if (media === null || campione === null || scarto === null || campione < GARE_MINIME) {
        assenti.push(b.nome);
        continue;
      }
      voci.push({
        chiave: b.chiave,
        nome: b.nome,
        gruppo: b.gruppo,
        percentuale: "percentuale" in b && b.percentuale === true,
        campione,
        media,
        scarto,
      });
    }
    if (voci.length === 0) return null;

    return { sourceId: teamSourceId, nome: riga.nome, gare, dal: riga.dal, al: riga.al, voci, assenti };
  } catch {
    // Una sezione che non si puo' leggere non compare: non si inventa.
    return null;
  }
}

/**
 * Le competizioni che hanno abbastanza squadre per una classifica, dalla piu' coperta in giu'.
 *
 * La stagione e' quella con la gara piu' recente. Il suo **nome** non compare qui ed e'
 * voluto: tutte e 55 le stagioni del database sono segnaposto, quindi la pagina nomina la
 * competizione e dice «stagione in corso», che e' l'unica cosa vera che puo' dire.
 */
export async function competizioniConSquadre(): Promise<readonly CompetizioneConSquadre[]> {
  const sql = connessione();
  if (sql === null) return [];
  try {
    const righe = await sql<Array<{
      source_id: string | null; name: string; country_name: string | null;
      squadre: string; ultima: string;
    }>>`
      with per_squadra as (
        select competition_id, season_id, team_id, count(*) as gare,
               max(kickoff_at) as ultima
        from football.team_match_observations
        group by 1, 2, 3
        having count(*) >= ${GARE_MINIME}
      ),
      recente as (
        select distinct on (competition_id) competition_id, season_id
        from football.team_match_observations
        group by competition_id, season_id
        order by competition_id, max(kickoff_at) desc
      )
      select c.source_id::text, c.name, c.country_name, count(*)::text as squadre,
             max(p.ultima)::text as ultima
      from per_squadra p
      join recente r on r.competition_id = p.competition_id and r.season_id = p.season_id
      join football.competitions c on c.id = p.competition_id
      group by 1, 2, 3
      having count(*) >= 4
      order by count(*) desc, c.name
    `;
    return righe
      .filter((r) => r.source_id !== null)
      .map((r) => ({
        sourceId: Number(r.source_id),
        nome: r.name,
        paese: r.country_name,
        squadre: Number(r.squadre),
        ultima: r.ultima,
      }));
  } catch {
    return [];
  }
}

/**
 * La classifica di una competizione su un bersaglio, dentro la stagione piu' recente.
 *
 * Qui la finestra **non** e' quella dei 365 giorni: una classifica che mescolasse due
 * stagioni direbbe piu' del vero, e chi ha giocato di piu' salirebbe per il solo fatto di
 * aver giocato di piu'.
 */
export async function classificaSquadre(
  competitionSourceId: number,
  chiave: ChiaveBersaglio,
  perimetro: PerimetroClassifica = "tutte",
): Promise<readonly RigaClassificaSquadre[]> {
  const sql = connessione();
  if (sql === null) return [];
  const bersaglio = BERSAGLI.find((b) => b.chiave === chiave);
  if (bersaglio === undefined) return [];
  const col = bersaglio.colonna;
  // Prodotto e concesso nascono dalle **stesse** gare: senza questo filtro comune le due
  // colonne poggerebbero su campioni diversi e la loro differenza non direbbe niente.
  const entrambi = "where o." + col + " is not null and a." + col + " is not null";
  try {
    const righe = await sql<Array<{
      source_id: string; name: string; campione: string; media: string; concessa: string | null;
    }>>`
      with recente as (
        select o.competition_id, o.season_id
        from football.team_match_observations o
        join football.competitions c on c.id = o.competition_id
        where c.source_id = ${competitionSourceId}::bigint
        group by 1, 2
        order by max(o.kickoff_at) desc
        limit 1
      )
      select t.source_id::text, t.name,
             count(*) filter (${sql.unsafe(entrambi)})::text as campione,
             avg(o.${sql.unsafe(col)}) filter (${sql.unsafe(entrambi)})::text as media,
             avg(a.${sql.unsafe(col)}) filter (${sql.unsafe(entrambi)})::text as concessa
      from football.team_match_observations o
      -- La riga dell'altro lato della stessa gara: e' da li' che viene il concesso.
      join football.team_match_observations a
        on a.match_id = o.match_id and a.side <> o.side
      join recente r on r.competition_id = o.competition_id and r.season_id = o.season_id
      join football.teams t on t.id = o.team_id
      where ${perimetro === "tutte" ? sql`true` : sql`o.side = ${perimetro}`}
      group by 1, 2
      having count(*) filter (${sql.unsafe(entrambi)}) >= ${GARE_MINIME}
      order by avg(o.${sql.unsafe(col)}) filter (${sql.unsafe(entrambi)}) desc, t.name
    `;
    return righe.map((r) => ({
      sourceId: Number(r.source_id),
      nome: r.name,
      campione: Number(r.campione),
      media: Number(r.media),
      concessa: r.concessa === null ? null : Number(r.concessa),
    }));
  } catch {
    return [];
  }
}
