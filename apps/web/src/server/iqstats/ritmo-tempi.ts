// Server-only: come si divide fra primo e secondo tempo quello che le due squadre
// producono.
//
// **Non e' una previsione e non tocca il motore.** Sono gare gia' giocate: si dice
// da che parte pende la produzione nelle partite di queste due squadre, e basta.
// Nessuna probabilita', nessun over, nessun indice.
//
// **Da dove vengono i numeri.** Da `football.team_match_halves`, che porta
// `stats.first_half` e `stats.second_half` della stessa risposta gia' archiviata
// per il motore. Nessuna chiamata nuova alla fonte, una interrogazione sola.
//
// **Si guarda la quota, non i valori grezzi.** Due tempi non hanno lo stesso
// numero di gare alle spalle metrica per metrica, e leggere «0,42 contro 0,71»
// senza il totale non dice quanto pesa: la quota del primo tempo sul totale della
// gara e' la stessa scala per tutte le metriche.
//
// **La quota si misura per gara e poi si media.** Sommare tutti i primi tempi e
// dividere per il totale darebbe piu' peso alle gare piu' produttive; la media
// delle quote per gara ha anche la sua dispersione, e da quella esce l'errore.
//
// **Il possesso resta fuori, ed e' una misura non un gusto.** Per tempo la fonte
// lo da' come percentuale **fra le due squadre di quel tempo**: 61 e 39 nel primo,
// 61 e 39 nel secondo. Non e' una quantita' che si divide fra i due tempi, e
// metterlo nella stessa lista direbbe il falso.
//
// **Anti-leakage.** Finestra `kickoff_at < quando`, come ovunque nel motore: la
// gara da leggere non entra mai nei numeri che la leggono.
import "server-only";

import { connessione } from "./lettura.ts";

/** Quante gare al massimo si guardano indietro, come nelle altre letture. */
const MAX_GARE = 400;
/** Sotto queste gare una quota non e' una tendenza: la metrica si dichiara esclusa. */
const GARE_MINIME = 5;
/** Quante voci si mostrano al massimo: la comprensione, non la quantita'. */
const VOCI_MOSTRATE = 4;

/**
 * Le metriche ammesse, con il nome che si legge in pagina.
 *
 * I gol attesi arrivano da `expected_goals` e sono nulli dove la fonte dichiara di
 * averli stimati: una stima della fonte non e' un'osservazione.
 */
const METRICHE = [
  { chiave: "xg", colonna: "expected_goals", nome: "gol attesi" },
  { chiave: "tiri", colonna: "total_shots", nome: "tiri" },
  { chiave: "porta", colonna: "shots_on_target", nome: "tiri in porta" },
  { chiave: "corner", colonna: "corner_kicks", nome: "corner" },
  { chiave: "falli", colonna: "fouls", nome: "falli" },
] as const;

export interface QuotaDiTempo {
  readonly chiave: string;
  readonly nome: string;
  /** Gare su cui poggia questa metrica: entrambe le squadre, entrambi i tempi. */
  readonly gare: number;
  /** Quota del primo tempo sul totale della gara, da 0 a 1. */
  readonly quotaPrimo: number;
  /** Quanto se ne produce per gara nei due tempi, per chi vuole il numero. */
  readonly primo: number;
  readonly secondo: number;
  /** `true` quando lo scarto dalla meta' supera l'errore della sua media. */
  readonly oltreIlRumore: boolean;
}

export interface RitmoDeiTempi {
  /** La frase che risponde alla domanda, gia' scritta. */
  readonly titolo: string;
  readonly voci: readonly QuotaDiTempo[];
  /** Metriche lasciate fuori per campione insufficiente, con il loro nome. */
  readonly escluse: readonly string[];
}

/** Il numero, o `null` se la colonna non c'era: un'assenza non diventa zero. */
function numero(valore: string | null | undefined): number | null {
  if (valore === null || valore === undefined) return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

/**
 * Quali voci si mostrano e che frase le riassume.
 *
 * Pura: prende le quote gia' misurate e non tocca il database, cosi' la regola di
 * lettura si prova senza.
 */
export function letturaDeiTempi(voci: readonly QuotaDiTempo[]): RitmoDeiTempi | null {
  if (voci.length === 0) return null;
  // Prima quelle che si distinguono dal caso, poi le altre: dentro ciascun gruppo
  // vince lo scarto piu' largo, che e' l'informazione piu' densa.
  const ordinate = [...voci].sort((a, b) => {
    if (a.oltreIlRumore !== b.oltreIlRumore) return a.oltreIlRumore ? -1 : 1;
    return Math.abs(b.quotaPrimo - 0.5) - Math.abs(a.quotaPrimo - 0.5);
  });
  const parlanti = ordinate.filter((v) => v.oltreIlRumore);
  // Se nessuna si distingue si mostrano comunque le due piu' larghe, ma la frase
  // non promette una tendenza che i numeri non reggono.
  const scelte = ordinate.slice(0, Math.min(VOCI_MOSTRATE, Math.max(2, parlanti.length)));

  const ripresa = parlanti.filter((v) => v.quotaPrimo < 0.5).length;
  const avvio = parlanti.filter((v) => v.quotaPrimo > 0.5).length;
  const titolo = parlanti.length === 0
    ? "La produzione è equilibrata fra i due tempi"
    : ripresa > 0 && avvio === 0
      ? "Il ritmo cresce nella ripresa"
      : avvio > 0 && ripresa === 0
        ? "Il primo tempo concentra più produzione"
        : "Fra i due tempi cambia la produzione, ma non nella stessa direzione";

  return { titolo, voci: scelte, escluse: [] };
}

/**
 * Il ritmo per tempo delle gare di queste due squadre prima di `quando`.
 *
 * Il campione e' l'unione delle loro gare: una partita fra le due conta una volta,
 * perche' si conta la gara e non la squadra.
 */
export async function ritmoDeiTempi(
  casaSourceId: number,
  trasfertaSourceId: number,
  quando: string,
): Promise<RitmoDeiTempi | null> {
  const sql = connessione();
  if (sql === null) return null;

  // Per gara: il totale delle due squadre in ciascun tempo, e quante delle quattro
  // righe portano davvero la metrica. Sotto quattro la gara esce da quella metrica:
  // un tempo a meta' non e' un tempo.
  const perGara = METRICHE
    .flatMap((m) => [
      "sum(h." + m.colonna + ") filter (where h.half = 1) as p_" + m.chiave,
      "sum(h." + m.colonna + ") filter (where h.half = 2) as s_" + m.chiave,
      "count(h." + m.colonna + ") as n_" + m.chiave,
    ])
    .join(",\n               ");

  const quote = METRICHE
    .flatMap((m) => {
      const k = m.chiave;
      // Una gara senza niente in nessuno dei due tempi non ha una quota: dividere
      // per zero non e' equilibrio, e' assenza.
      const regge = " filter (where n_" + k + " = 4 and p_" + k + " + s_" + k + " > 0) ";
      const q = "(p_" + k + "::numeric / nullif(p_" + k + " + s_" + k + ", 0))";
      return [
        "count(*)" + regge + "as gare_" + k,
        "avg(" + q + ")" + regge + "as quota_" + k + "",
        "stddev_samp(" + q + ")" + regge + "as sd_" + k,
        "avg(p_" + k + "::numeric)" + regge + "as media_p_" + k,
        "avg(s_" + k + "::numeric)" + regge + "as media_s_" + k,
      ];
    })
    .join(",\n             ");

  const scelte = METRICHE
    .flatMap((m) => ["gare_", "quota_", "sd_", "media_p_", "media_s_"]
      .map((prefisso) => prefisso + m.chiave + "::text"))
    .join(", ");

  try {
    const righe = await sql<Record<string, string | null>[]>`
      with gare as (
        select m.id
        from football.matches m
        join football.teams casa on casa.source_id = ${casaSourceId}::bigint
        join football.teams fuori on fuori.source_id = ${trasfertaSourceId}::bigint
        where m.kickoff_at < ${quando}::timestamptz
          and (m.home_team_id in (casa.id, fuori.id) or m.away_team_id in (casa.id, fuori.id))
        order by m.kickoff_at desc
        limit ${MAX_GARE}
      ), per_gara as (
        select h.match_id,
               ${sql.unsafe(perGara)}
        from football.team_match_halves h
        join gare g on g.id = h.match_id
        group by 1
      ), quote as (
        select ${sql.unsafe(quote)}
        from per_gara
      )
      select ${sql.unsafe(scelte)}
      from quote
    `;
    const riga = righe[0];
    if (riga === undefined) return null;

    const voci: QuotaDiTempo[] = [];
    const escluse: string[] = [];
    for (const m of METRICHE) {
      const gare = numero(riga["gare_" + m.chiave]) ?? 0;
      const quotaPrimo = numero(riga["quota_" + m.chiave]);
      const primo = numero(riga["media_p_" + m.chiave]);
      const secondo = numero(riga["media_s_" + m.chiave]);
      if (gare < GARE_MINIME || quotaPrimo === null || primo === null || secondo === null) {
        escluse.push(m.nome);
        continue;
      }
      const scarto = numero(riga["sd_" + m.chiave]);
      const errore = scarto === null || gare < 2 ? null : scarto / Math.sqrt(gare);
      voci.push({
        chiave: m.chiave,
        nome: m.nome,
        gare,
        quotaPrimo,
        primo,
        secondo,
        oltreIlRumore: errore !== null && Math.abs(quotaPrimo - 0.5) > errore,
      });
    }

    const lettura = letturaDeiTempi(voci);
    return lettura === null ? null : { ...lettura, escluse };
  } catch {
    // Un tempo che non si riesce a leggere non diventa un tempo inventato.
    return null;
  }
}
