// Server-only: il metro di lega di una squadra, letto dalle nostre osservazioni.
//
// **Non duplica le medie che la pagina gia' mostra.** `team-page.ts` porta dal provider la
// tabella casa/trasferta/totale: quei numeri restano suoi. Qui si aggiunge l'unica cosa che
// quella tabella non puo' dire, perche' guarda una squadra sola: **dove sta**, rispetto alle
// altre dello stesso campionato e della stessa stagione.
//
// **Il metro e' la distribuzione vera, non una scala inventata.** Nessun indice centrato su
// cento, nessuna soglia scelta a mano: si dice quante squadre ne supera, e quel numero
// cambia con il campionato invece di pretendere di valere ovunque. E' la stessa regola
// dell'area Arbitri (`referees.ts`), applicata a un'altra entita'.
//
// **Il confronto e' dentro la stagione.** Una media di quest'anno contro la distribuzione di
// tre stagioni direbbe piu' del vero: campionati diversi e anni diversi hanno livelli
// diversi, e mescolarli e' il modo piu' facile per far sembrare straordinaria una squadra
// normale.
//
// **Sotto il campione minimo non si dice niente.** Cinque gare non fanno una tendenza, e una
// squadra con due gare in cima alla distribuzione la falserebbe anche per le altre: resta
// fuori dal metro, e il metro dichiara su quante squadre poggia.
import "server-only";

import { connessione } from "./lettura.ts";

/** Sotto questo campione una squadra non entra nel metro, ne' come soggetto ne' come metro. */
const GARE_MINIME = 5;

/**
 * I sette bersagli del motore, e nient'altro.
 *
 * Sono le metriche che il prodotto gia' nomina in ogni pagina: usare qui le stesse vuol dire
 * che «tiri» e' la stessa cosa nel dossier, nella proiezione e qui. Aggiungerne altre e'
 * una riga per ciascuna, ma solo quando servono davvero a qualcuno.
 */
// **Le chiavi sono tutte minuscole, e non e' un vezzo.** Diventano alias SQL, e Postgres
// abbassa gli identificativi non quotati: `n_inPorta` torna come `n_inporta`, la lettura per
// chiave non lo trova e il bersaglio finisce fra gli assenti pur avendo il dato. E' successo,
// e si vedeva solo guardando la pagina.
const BERSAGLI = [
  { chiave: "tiri", colonna: "total_shots", nome: "Tiri" },
  { chiave: "in_porta", colonna: "shots_on_target", nome: "Tiri in porta" },
  { chiave: "corner", colonna: "corner_kicks", nome: "Corner" },
  { chiave: "falli", colonna: "fouls", nome: "Falli" },
  { chiave: "gialli", colonna: "yellow_cards", nome: "Cartellini gialli" },
  { chiave: "fuorigioco", colonna: "offsides", nome: "Fuorigioco" },
  { chiave: "parate", colonna: "goalkeeper_saves", nome: "Parate" },
] as const;

export interface VoceDelMetro {
  readonly nome: string;
  /**
   * Le gare su cui poggia **questa** media, che non sono tutte quelle osservate.
   *
   * `avg()` salta i nulli: su 66 gare del Corinthians solo 38 portano il pannello, e
   * dichiarare 66 direbbe che il numero e' piu' solido di quanto sia. Ogni bersaglio ha il
   * suo, perche' le colonne non si riempiono insieme.
   */
  readonly campione: number;
  /** La media della squadra, dalle nostre righe. */
  readonly media: number;
  /** La media di tutte le squadre del campionato in questa stagione. */
  readonly mediaDiLega: number;
  /** Quante squadre ne supera, da 0 a 1. */
  readonly quota: number;
}

export interface MetroDiLega {
  readonly competizione: string;
  /** I bersagli che questa competizione non osserva: si dicono, non si tolgono in silenzio. */
  readonly assenti: readonly string[];
  /** Le gare della squadra su cui poggiano le sue medie. */
  readonly gare: number;
  /** Quante squadre compongono il metro, campione minimo compreso. */
  readonly squadre: number;
  readonly voci: readonly VoceDelMetro[];
}

// Il nome della stagione non c'e', ed e' voluto: **tutte e 55 le stagioni del database sono
// segnaposto** (`Stagione 317 (segnaposto locale)`), e tutte hanno righe. Un campo che non
// si puo' mostrare non entra nel contratto: la stagione la sceglie chi guarda la pagina, e
// il metro dichiara la competizione, che invece ha i nomi veri.
interface RigaMetro {
  readonly competizione: string;
  readonly gare: string;
  readonly squadre: string;
  readonly [colonna: string]: string;
}

/** Il numero, o `null` se la colonna non c'era: un'assenza non diventa zero. */
function numero(valore: string | null | undefined): number | null {
  if (valore === null || valore === undefined) return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

/**
 * Il metro di una squadra per una stagione, o `null` se non se ne puo' costruire uno.
 *
 * Gli identificativi arrivano da chi legge la pagina, che conosce quelli della fonte: la
 * traduzione passa da `source_id`, come ovunque nel livello dati.
 */
export async function metroDiLega(
  teamSourceId: number,
  competitionSourceId: number,
  seasonSourceId: number,
): Promise<MetroDiLega | null> {
  const sql = connessione();
  if (sql === null) return null;

  // Media, media di lega e posizione per ciascun bersaglio. Le colonne sono scritte qui
  // sopra una per una e non arrivano dall'indirizzo: nessun nome di colonna viene da fuori.
  const medie = BERSAGLI
    .flatMap((b) => [
      "avg(o." + b.colonna + ") as " + b.chiave,
      "count(o." + b.colonna + ") as n_" + b.chiave,
    ])
    .join(",\n           ");
  const posizioni = BERSAGLI
    .map((b) => "percent_rank() over (partition by competition_id, season_id order by "
      + b.chiave + ") as pr_" + b.chiave)
    .join(",\n           ");
  const medieDiLega = BERSAGLI
    .map((b) => "avg(" + b.chiave + ") over (partition by competition_id, season_id) as lega_"
      + b.chiave)
    .join(",\n           ");
  const scelte = BERSAGLI
    .flatMap((b) => [
      b.chiave + "::text", "pr_" + b.chiave + "::text",
      "lega_" + b.chiave + "::text", "n_" + b.chiave + "::text",
    ])
    .join(", ");

  try {
    const righe = await sql<RigaMetro[]>`
      with per_squadra as (
        select o.competition_id, o.season_id, o.team_id, count(*) as gare,
               ${sql.unsafe(medie)}
        from football.team_match_observations o
        join football.seasons s on s.id = o.season_id
        join football.competitions c on c.id = o.competition_id
        -- La stagione da sola non basta: lo stesso identificativo di stagione della fonte
        -- compare in piu' competizioni. Filtrando solo per quello, una squadra che gioca
        -- anche una coppa finiva con le righe di due tornei nello stesso gruppo, e il
        -- metro confrontava campionati diversi senza dirlo. La coppia competizione piu'
        -- stagione e' l'unica chiave che la pagina puo' dare e che nomina un torneo solo.
        where c.source_id = ${competitionSourceId}::bigint
          and s.source_id = ${seasonSourceId}::bigint
        group by 1, 2, 3
        having count(*) >= ${GARE_MINIME}
      ),
      con_metro as (
        select *,
               count(*) over (partition by competition_id, season_id) as squadre,
               ${sql.unsafe(posizioni)},
               ${sql.unsafe(medieDiLega)}
        from per_squadra
      )
      select c.name as competizione, m.gare::text, m.squadre::text, ${sql.unsafe(scelte)}
      from con_metro m
      join football.teams t on t.id = m.team_id
      join football.competitions c on c.id = m.competition_id
      where t.source_id = ${teamSourceId}::bigint
      limit 1
    `;

    const riga = righe[0];
    if (riga === undefined) return null;

    const squadre = numero(riga.squadre);
    const gare = numero(riga.gare);
    if (squadre === null || gare === null) return null;
    // Con una squadra sola nel metro `percent_rank()` vale sempre zero: non e' una
    // posizione, e dichiararla direbbe «ultima» a chi e' l'unica.
    if (squadre < 2) return null;

    const voci: VoceDelMetro[] = [];
    const assenti: string[] = [];
    for (const b of BERSAGLI) {
      const media = numero(riga[b.chiave]);
      const quota = numero(riga["pr_" + b.chiave]);
      const mediaDiLega = numero(riga["lega_" + b.chiave]);
      const campione = numero(riga["n_" + b.chiave]);
      // Una metrica che nessuna gara di questo torneo porta non diventa uno zero e non
      // sparisce: entra fra le assenze, e la pagina la nomina. Vale lo stesso sotto il
      // campione minimo: una media su due gare non e' una tendenza.
      if (media === null || quota === null || mediaDiLega === null
        || campione === null || campione < GARE_MINIME) {
        assenti.push(b.nome);
        continue;
      }
      voci.push({ nome: b.nome, campione, media, mediaDiLega, quota });
    }
    if (voci.length === 0) return null;

    return {
      competizione: riga.competizione,
      assenti,
      gare,
      squadre,
      voci,
    };
  } catch {
    // Il metro e' un di piu': se non si puo' leggere, la scheda squadra resta quella di
    // prima invece di cadere.
    return null;
  }
}
