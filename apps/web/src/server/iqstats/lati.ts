// Server-only: quello che una squadra **produce e concede dal suo lato del campo**, letto
// dalle nostre righe invece che chiesto alla fonte.
//
// **Perche' esiste.** La tabella casa/trasferta che la scheda squadra mostra oggi arriva da
// `getTeamSeasonSplits`, che costa **una richiesta per gara** fino a cinquanta gare e vive
// nel gateway. Le stesse righe stanno gia' nel livello dati con la colonna `side`: qui si
// leggono in una query sola. Non e' una questione di quota — le chiamate non hanno limiti —
// ma la regola architetturale e' che gli aggregati che sappiamo calcolare non si chiedono.
//
// **Il concesso e' quello che l'avversario ha prodotto nella stessa gara**, non una colonna
// a se': si prende con un innesto sulla riga dell'altro lato.
//
// **Prodotto e concesso hanno lo stesso campione, sempre.** Una metrica entra nella media
// solo se **entrambi** i lati la portano in quella gara: con una riga sola il confronto
// sarebbe fra numeri costruiti su gare diverse, e non si vedrebbe. E' la stessa regola del
// `having count(*) = 2` che `gareDirette` applica all'arbitro.
//
// **Oggi quella guardia non cambia un solo numero, ed e' misurato:** su 10.673 gare, **zero**
// portano una metrica da un lato solo e **zero** hanno righe diverse da due. Resta lo stesso,
// perche' nessun vincolo del database lo impone: e' un fatto sui dati di adesso, non una
// garanzia. `test:lati` sorveglia proprio quell'invariante, cosi' il giorno in cui cade la
// prova diventa rossa invece di lasciare passare medie costruite a meta'.
import "server-only";

import { connessione } from "./lettura.ts";

export type Lato = "home" | "away";

/** Sotto queste gare una media non e' una tendenza: la voce si dichiara assente. */
const GARE_MINIME = 5;

/**
 * Le metriche che si leggono per lato, dichiarate qui una per una.
 *
 * **Le chiavi sono tutte minuscole, e non e' un vezzo.** Diventano alias SQL, e Postgres
 * abbassa gli identificativi non quotati: una chiave con una maiuscola torna diversa da
 * come e' stata scritta, la lettura non la trova e la metrica finisce fra le assenti pur
 * avendo il dato. E' gia' successo in `team-metro.ts`, e si vedeva solo guardando la pagina.
 *
 * I primi sette sono i bersagli del motore, e portano gli stessi nomi che il prodotto usa
 * altrove. Gli altri dodici descrivono **come** si gioca, non quanto: sono le colonne che il
 * motore usa gia' come ingressi di contesto e che nessuna pagina ha mai mostrato.
 */
const METRICHE = [
  { chiave: "tiri", colonna: "total_shots", nome: "Tiri" },
  { chiave: "in_porta", colonna: "shots_on_target", nome: "Tiri in porta" },
  { chiave: "corner", colonna: "corner_kicks", nome: "Corner" },
  { chiave: "falli", colonna: "fouls", nome: "Falli" },
  { chiave: "gialli", colonna: "yellow_cards", nome: "Cartellini gialli" },
  { chiave: "fuorigioco", colonna: "offsides", nome: "Fuorigioco" },
  { chiave: "parate", colonna: "goalkeeper_saves", nome: "Parate" },
  { chiave: "possesso", colonna: "ball_possession", nome: "Possesso" },
  { chiave: "passaggi", colonna: "passes", nome: "Passaggi" },
  { chiave: "passaggi_riusciti", colonna: "accurate_passes", nome: "Passaggi riusciti" },
  { chiave: "precisione", colonna: "pass_accuracy_pct", nome: "Precisione dei passaggi" },
  { chiave: "palle_lunghe", colonna: "long_balls_total", nome: "Palle lunghe" },
  { chiave: "ultimo_terzo", colonna: "final_third_entries", nome: "Ingressi in ultimo terzo" },
  { chiave: "tocchi_area", colonna: "touches_in_penalty_area", nome: "Tocchi in area" },
  { chiave: "cross", colonna: "crosses_total", nome: "Cross" },
  { chiave: "duelli", colonna: "duels", nome: "Duelli" },
  { chiave: "tackle", colonna: "tackles", nome: "Tackle" },
  { chiave: "intercetti", colonna: "interceptions", nome: "Intercetti" },
  { chiave: "recuperi", colonna: "recoveries", nome: "Recuperi" },
] as const;

export type ChiaveDiLato = (typeof METRICHE)[number]["chiave"];

export interface VoceDiLato {
  readonly chiave: string;
  readonly nome: string;
  /** La media a partita di quello che la squadra fa, da questo lato. */
  readonly prodotto: number;
  /** La media a partita di quello che l'avversario le fa, nelle stesse gare. */
  readonly concesso: number;
  /**
   * Le gare in cui **entrambi** i lati portano questa metrica.
   *
   * Non sono le gare giocate: le colonne non si riempiono insieme, e dichiarare le gare
   * direbbe che il numero e' piu' solido di quanto sia.
   */
  readonly campione: number;
}

export interface MedieDiLato {
  readonly lato: Lato;
  /** Le gare giocate da questo lato, che sono il tetto di ogni campione. */
  readonly gare: number;
  readonly voci: readonly VoceDiLato[];
  /** Le metriche che questo torneo non osserva, o non abbastanza: si dicono, non spariscono. */
  readonly assenti: readonly string[];
}

/** Il numero, o `null` se la colonna non c'era: un'assenza non diventa zero. */
function numero(valore: string | null | undefined): number | null {
  if (valore === null || valore === undefined) return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

interface RigaDiLato {
  readonly gare: string;
  readonly [colonna: string]: string | null;
}

/**
 * Prodotto e concesso di una squadra da un lato del campo, o `null` se non se ne cava niente.
 *
 * Gli identificativi sono quelli della fonte, come ovunque nel livello dati: la traduzione
 * passa da `source_id`. La coppia competizione **piu'** stagione e' l'unica chiave che
 * nomina un torneo solo, perche' lo stesso identificativo di stagione compare in piu'
 * competizioni.
 */
export async function medieDiLato(
  teamSourceId: number,
  competitionSourceId: number,
  seasonSourceId: number,
  lato: Lato,
): Promise<MedieDiLato | null> {
  const sql = connessione();
  if (sql === null) return null;

  // Le espressioni si costruiscono dalle costanti qui sopra: nessun nome di colonna arriva
  // dall'indirizzo. Il filtro e' identico per i tre aggregati di una metrica, ed e' cio' che
  // tiene prodotto, concesso e campione sulle stesse gare.
  const aggregati = METRICHE
    .flatMap((m) => {
      const entrambi = "where o." + m.colonna + " is not null and a." + m.colonna + " is not null";
      return [
        "avg(o." + m.colonna + ") filter (" + entrambi + ") as p_" + m.chiave,
        "avg(a." + m.colonna + ") filter (" + entrambi + ") as c_" + m.chiave,
        "count(*) filter (" + entrambi + ") as n_" + m.chiave,
      ];
    })
    .join(",\n             ");
  const scelte = METRICHE
    .flatMap((m) => ["p_" + m.chiave + "::text", "c_" + m.chiave + "::text",
      "n_" + m.chiave + "::text"])
    .join(", ");

  try {
    const righe = await sql<RigaDiLato[]>`
      with per_lato as (
        select count(*) as gare,
               ${sql.unsafe(aggregati)}
        from football.team_match_observations o
        -- La riga dell'altro lato della stessa gara: e' da li' che viene il concesso.
        -- Il vincolo e' sul lato e non sulla squadra, cosi' una gara non puo' innestarsi
        -- su se stessa ne' moltiplicarsi se un giorno una gara portasse righe in piu'.
        join football.team_match_observations a
          on a.match_id = o.match_id and a.side <> o.side
        join football.teams t on t.id = o.team_id
        join football.competitions c on c.id = o.competition_id
        join football.seasons s on s.id = o.season_id
        where t.source_id = ${teamSourceId}::bigint
          and c.source_id = ${competitionSourceId}::bigint
          and s.source_id = ${seasonSourceId}::bigint
          and o.side = ${lato}
      )
      select gare::text, ${sql.unsafe(scelte)} from per_lato
    `;

    const riga = righe[0];
    if (riga === undefined) return null;
    const gare = numero(riga.gare);
    if (gare === null || gare === 0) return null;

    const voci: VoceDiLato[] = [];
    const assenti: string[] = [];
    for (const m of METRICHE) {
      const prodotto = numero(riga["p_" + m.chiave]);
      const concesso = numero(riga["c_" + m.chiave]);
      const campione = numero(riga["n_" + m.chiave]);
      // Sotto la soglia, o senza uno dei due lati, la voce non si mostra e non si azzera:
      // si dichiara. Una media su due gare non e' una tendenza, e un concesso mancante
      // renderebbe il prodotto un numero senza confronto.
      if (prodotto === null || concesso === null || campione === null
        || campione < GARE_MINIME) {
        assenti.push(m.nome);
        continue;
      }
      voci.push({ chiave: m.chiave, nome: m.nome, prodotto, concesso, campione });
    }
    if (voci.length === 0) return null;

    return { lato, gare, voci, assenti };
  } catch {
    // Un lato che non si puo' leggere non diventa un lato inventato.
    return null;
  }
}
