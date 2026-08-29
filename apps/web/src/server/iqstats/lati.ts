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
 * altrove. I dodici che seguono descrivono **come** si gioca, non quanto: sono le colonne che
 * il motore usa gia' come ingressi di contesto e che nessuna pagina ha mai mostrato. Le
 * ultime quattro vengono dalla shot map e sono **quote**, non conteggi: portano un `peso` e
 * si aggregano sui totali.
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
  // Le cinque che aveva solo «Il contesto», portate qui quando quella sezione e' stata
  // assorbita: due sezioni davano lo stesso confronto con due finestre diverse e per lo
  // stesso fatto scrivevano 18,4 e 18,9. Copertura su entrambi i lati, misurata su 10.699
  // gare: 9.289, 9.261, 9.261, 9.290, 9.275.
  { chiave: "duelli_aerei", colonna: "aerial_duels_total", nome: "Duelli aerei" },
  { chiave: "tiri_in_area", colonna: "shots_inside_box", nome: "Tiri dall'interno" },
  { chiave: "tiri_da_fuori", colonna: "shots_outside_box", nome: "Tiri da fuori area" },
  { chiave: "grandi_occasioni", colonna: "big_chances", nome: "Grandi occasioni" },
  { chiave: "punizioni", colonna: "free_kicks", nome: "Punizioni" },
  // **Le quattro della shot map sono quote, non conteggi, e per questo portano un peso.**
  // La quota di una squadra si fa sui suoi totali - somma su somma - non come media delle
  // quote delle singole gare: una partita da tre tiri peserebbe quanto una da venti. E'
  // lo stesso errore corretto sull'arbitro il 28 agosto. Misurato su 1.148 celle
  // squadra/lato: la media non pesata si scosta dalla quota vera fino a **10,88 punti**,
  // in media 1,23, e supera il punto in **535 celle su 1.148**.
  { chiave: "quota_area", colonna: "shot_map_share_in_box", peso: "shot_map_total", nome: "Tiri dall'area" },
  { chiave: "distanza_tiro", colonna: "shot_map_avg_distance", peso: "shot_map_total", nome: "Distanza del tiro" },
  { chiave: "qualita_tiro", colonna: "shot_map_xg_per_shot", peso: "shot_map_total", nome: "Qualità del tiro" },
  { chiave: "quota_murati", colonna: "shot_map_share_blocked", peso: "shot_map_total", nome: "Tiri murati" },
] as const;

/** Le colonne che entrano nella metrica: la sua, piu' il peso quando e' una quota. */
function colonneDi(m: (typeof METRICHE)[number]): readonly string[] {
  const peso = "peso" in m ? m.peso : null;
  return peso === null ? [m.colonna] : [m.colonna, peso];
}

/**
 * Il filtro che tiene prodotto, concesso e campione sulle stesse gare.
 *
 * Per una quota servono **entrambe** le colonne su **entrambi** i lati: senza il peso la
 * quota non si puo' ricomporre sui totali, e una gara a meta' falserebbe il conto.
 */
function filtroDi(m: (typeof METRICHE)[number]): string {
  return "where " + colonneDi(m)
    .map((c) => "o." + c + " is not null and a." + c + " is not null")
    .join(" and ");
}

/** Il valore di una gara aggregato sul lato `lettera`: media per i conteggi, somma su somma per le quote. */
function valoreDi(lettera: "o" | "a", m: (typeof METRICHE)[number], filtro: string): string {
  const peso = "peso" in m ? m.peso : null;
  if (peso === null) return "avg(" + lettera + "." + m.colonna + ") filter (" + filtro + ")";
  return "sum(" + lettera + "." + m.colonna + " * " + lettera + "." + peso + ")"
    + " filter (" + filtro + ")"
    + " / nullif(sum(" + lettera + "." + peso + ") filter (" + filtro + "), 0)";
}

export type ChiaveDiLato = (typeof METRICHE)[number]["chiave"];

/**
 * Un numero della squadra con il metro con cui va letto.
 *
 * **Il metro e' quello dello stesso lato.** Confrontare i falli in casa con la media di
 * tutte le gare direbbe piu' del vero: in casa e in trasferta i livelli sono diversi, e
 * mescolarli e' il modo piu' facile per far sembrare severa una squadra normale. E' l'errore
 * gia' trovato in pagina sull'arbitro il 28 agosto, dove il numero e il giudizio uscivano da
 * gare diverse.
 */
export interface ConMetro {
  /** La media a partita della squadra. */
  readonly media: number;
  /** La media delle squadre del campionato, in questa stagione e da questo lato. */
  readonly mediaDiLega: number;
  /**
   * Quanto si discostano fra loro le squadre. `null` sotto le due squadre.
   *
   * Serve a sapere se una differenza e' una differenza: e' la stessa disciplina del
   * giudizio dell'arbitro, dove la soglia e' mezza dispersione e mai un numero scelto.
   */
  readonly dispersione: number | null;
  /** Quante squadre ne supera, da 0 a 1. */
  readonly posizione: number;
  /**
   * L'errore della **sua** media: quanto ballerebbe rifacendo il conto su altre gare.
   *
   * E' lo scarto fra le gare di questa squadra diviso la radice del campione, e non ha
   * niente a che vedere con `dispersione`, che dice quanto le squadre si discostano fra
   * loro. Serve a non chiamare differenza una differenza piu' piccola del rumore: due
   * medie si dicono diverse solo se lo scarto supera l'errore di entrambe messo insieme.
   *
   * `null` sotto le due gare, dove lo scarto non esiste.
   */
  readonly errore: number | null;
}

export interface VoceDiLato {
  readonly chiave: string;
  readonly nome: string;
  /** Quello che la squadra fa, da questo lato, con il suo metro. */
  readonly prodotto: ConMetro;
  /** Quello che l'avversario le fa nelle stesse gare, con il suo metro. */
  readonly concesso: ConMetro;
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
  /** Quante squadre compongono il metro, campione minimo compreso. */
  readonly squadre: number;
  readonly voci: readonly VoceDiLato[];
  /** Le metriche che questo torneo non osserva, o non abbastanza: si dicono, non spariscono. */
  readonly assenti: readonly string[];
}

/** L'errore della media: lo scarto fra le gare diviso la radice del campione. */
function errore(scarto: number | null, campione: number): number | null {
  if (scarto === null || campione < 2) return null;
  return scarto / Math.sqrt(campione);
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
      const entrambi = filtroDi(m);
      return [
        valoreDi("o", m, entrambi) + " as p_" + m.chiave,
        valoreDi("a", m, entrambi) + " as c_" + m.chiave,
        "count(*) filter (" + entrambi + ") as n_" + m.chiave,
        // **Lo scarto fra le gare della squadra, che non e' quello fra le squadre.** Serve
        // all'errore della media: senza, «12,8 contro 11,9» non dice se e' una differenza o
        // rumore. Il metro qui sotto misura un'altra cosa - quanto le squadre si discostano
        // fra loro - e dividerlo per il campione darebbe un errore che non e' quello di
        // questa squadra.
        // ponytail: per le quote e' lo scarto non pesato delle quote di gara, non quello
        // della quota sui totali; e' una stima prudente, si affina se un giorno serve.
        "stddev_samp(o." + m.colonna + ") filter (" + entrambi + ") as ds_p_" + m.chiave,
        "stddev_samp(a." + m.colonna + ") filter (" + entrambi + ") as ds_c_" + m.chiave,
      ];
    })
    .join(",\n               ");

  // Il metro: media e dispersione delle squadre del campionato **da questo lato**, e il
  // posto che ciascuna occupa. La finestra e' sempre competizione piu' stagione, come in
  // `team-metro.ts`: mescolare anni o tornei farebbe sembrare straordinaria una squadra
  // normale.
  const finestra = "over (partition by competition_id, season_id)";
  const metro = METRICHE
    .flatMap((m) => {
      const k = m.chiave;
      // **Nel metro entrano solo le squadre il cui numero regge.** Sotto il campione minimo
      // una squadra non e' un termine di paragone: con due gare puo' finire in cima e
      // falsare la posizione di tutte le altre. E' la stessa regola di `team-metro.ts`,
      // applicata qui alla singola metrica invece che alle gare, perche' le colonne non si
      // riempiono insieme: la prima stesura contava anche chi aveva **una** gara sola.
      const regge = " filter (where n_" + k + " >= " + String(GARE_MINIME) + ") ";
      // Fuori dal metro il valore non esiste, e senza valore `rank()` mette in coda: e'
      // quello che serve, perche' cosi' quelle squadre non rubano posizioni a nessuno.
      const dentro = "(case when n_" + k + " >= " + String(GARE_MINIME) + " then ";
      return [
        "avg(p_" + k + ")" + regge + finestra + " as lega_p_" + k,
        "avg(c_" + k + ")" + regge + finestra + " as lega_c_" + k,
        "stddev_samp(p_" + k + ")" + regge + finestra + " as sd_p_" + k,
        "stddev_samp(c_" + k + ")" + regge + finestra + " as sd_c_" + k,
        "rank() over (partition by competition_id, season_id order by "
          + dentro + "p_" + k + " end)) as rk_p_" + k,
        "rank() over (partition by competition_id, season_id order by "
          + dentro + "c_" + k + " end)) as rk_c_" + k,
        // **Il denominatore conta solo le squadre confrontabili.** `percent_rank()` divide
        // invece per tutte, e chi resta fuori dal metro, finendo in coda, ruba posizioni.
        // Misurato: nella Stoiximan Super League sedici squadre arrivano a cinque gare in
        // casa e quattordici portano i falli con un campione che regge, e dividere per
        // sedici darebbe alla prima **0,87** invece di **1**. Prodotto e concesso hanno lo
        // stesso campione per costruzione, quindi un conteggio solo basta per entrambi.
        "count(*)" + regge + finestra + " as nq_" + k,
      ];
    })
    .join(",\n               ");

  const scelte = METRICHE
    .flatMap((m) => {
      const k = m.chiave;
      return ["p_", "c_", "n_", "ds_p_", "ds_c_",
        "lega_p_", "lega_c_", "sd_p_", "sd_c_", "rk_p_", "rk_c_", "nq_"]
        .map((prefisso) => prefisso + k + "::text");
    })
    .join(", ");

  try {
    const righe = await sql<RigaDiLato[]>`
      with per_lato as (
        select o.competition_id, o.season_id, o.team_id,
               count(distinct o.match_id) as gare,
               ${sql.unsafe(aggregati)}
        from football.team_match_observations o
        -- La riga dell'altro lato della stessa gara: e' da li' che viene il concesso.
        -- Il vincolo e' sul lato e non sulla squadra, cosi' una gara non puo' innestarsi
        -- su se stessa ne' moltiplicarsi se un giorno una gara portasse righe in piu'.
        join football.team_match_observations a
          on a.match_id = o.match_id and a.side <> o.side
        join football.competitions c on c.id = o.competition_id
        join football.seasons s on s.id = o.season_id
        where c.source_id = ${competitionSourceId}::bigint
          and s.source_id = ${seasonSourceId}::bigint
          and o.side = ${lato}
        group by 1, 2, 3
        having count(distinct o.match_id) >= ${GARE_MINIME}
      ),
      con_metro as (
        select *, count(*) ${sql.unsafe(finestra)} as squadre,
               ${sql.unsafe(metro)}
        from per_lato
      )
      select m.gare::text, m.squadre::text, ${sql.unsafe(scelte)}
      from con_metro m
      join football.teams t on t.id = m.team_id
      where t.source_id = ${teamSourceId}::bigint
      limit 1
    `;

    const riga = righe[0];
    if (riga === undefined) return null;
    const gare = numero(riga.gare);
    const squadre = numero(riga.squadre);
    if (gare === null || gare === 0 || squadre === null) return null;
    // Con una squadra sola non c'e' un metro: la posizione direbbe «prima» a chi e' l'unica.
    if (squadre < 2) return null;

    const voci: VoceDiLato[] = [];
    const assenti: string[] = [];
    for (const m of METRICHE) {
      const k = m.chiave;
      const prodotto = numero(riga["p_" + k]);
      const concesso = numero(riga["c_" + k]);
      const campione = numero(riga["n_" + k]);
      const legaProdotto = numero(riga["lega_p_" + k]);
      const legaConcesso = numero(riga["lega_c_" + k]);
      const rangoProdotto = numero(riga["rk_p_" + k]);
      const rangoConcesso = numero(riga["rk_c_" + k]);
      const quante = numero(riga["nq_" + k]);
      // Sotto la soglia, senza uno dei due lati, o senza almeno due squadre con cui
      // confrontarsi, la voce non si mostra e non si azzera: si dichiara. Una media su due
      // gare non e' una tendenza, e un numero senza metro non e' una lettura.
      if (prodotto === null || concesso === null || campione === null
        || legaProdotto === null || legaConcesso === null
        || rangoProdotto === null || rangoConcesso === null
        || quante === null || quante < 2 || campione < GARE_MINIME) {
        assenti.push(m.nome);
        continue;
      }
      voci.push({
        chiave: k,
        nome: m.nome,
        campione,
        prodotto: {
          media: prodotto,
          mediaDiLega: legaProdotto,
          dispersione: numero(riga["sd_p_" + k]),
          posizione: (rangoProdotto - 1) / (quante - 1),
          errore: errore(numero(riga["ds_p_" + k]), campione),
        },
        concesso: {
          media: concesso,
          mediaDiLega: legaConcesso,
          dispersione: numero(riga["sd_c_" + k]),
          posizione: (rangoConcesso - 1) / (quante - 1),
          errore: errore(numero(riga["ds_c_" + k]), campione),
        },
      });
    }
    if (voci.length === 0) return null;

    return { lato, gare, squadre, voci, assenti };
  } catch {
    // Un lato che non si puo' leggere non diventa un lato inventato.
    return null;
  }
}
