// Server-only: quali stagioni guardano le letture legate alla stagione.
//
// **Perche' esiste.** Le letture della gara guardano solo la stagione in corso: e' una
// scelta esplicita, perche' pescare dall'anno prima e spacciarlo per «come sta arrivando»
// la squadra dice il falso. Ma a settembre quel campione e' magro - sulle gare dei
// prossimi tre giorni sono 7,2 gare per squadra - e chi legge deve poter guardare piu'
// indietro **sapendo di farlo**, invece di ricevere una finestra allargata di nascosto.
//
// **Tre finestre, non una scala.** «La scorsa» sostituisce e non somma: e' un confronto,
// non un campione piu' grosso. «Tutto» somma, e su questo archivio aggiunge poco: le gare
// coperte vanno dal 22 febbraio 2025 al 1 luglio 2026, una stagione e mezza, e per lato si
// passa da 27,9 gare della sola stagione scorsa a 37,5 di tutto.
//
// **Resta dentro la competizione.** Anche «tutto» prende le stagioni di quella
// competizione e non le coppe: mettere una coppa accanto a un campionato cambia il metro,
// e vale qui come vale per le ultime cinque di lato.
//
// **L'etichetta si ricava dalle date, non dal nome.** Su 30 competizioni in gioco nei
// prossimi tre giorni, **nessuna** ha la stagione precedente con un nome mostrabile: 25 si
// chiamano «Stagione 243 (segnaposto locale)» e 5 non hanno stagione precedente in
// archivio. `starts_on` e `ends_on` invece ci sono sempre, e da quelli esce «2025/26».
import "server-only";

import { connessione } from "./lettura.ts";

/** Le tre finestre offerte dal selettore. La prima e' quella predefinita. */
export const FINESTRE = ["corrente", "scorsa", "tutto"] as const;

export type Finestra = (typeof FINESTRE)[number];

export interface StagioniScelte {
  readonly finestra: Finestra;
  /** Gli `source_id` delle stagioni da guardare. Vuoto quando la scelta non ha campione. */
  readonly stagioni: readonly number[];
  /** Come si chiama in pagina questa scelta: «2026/27», «2025/26», «tutto l'archivio». */
  readonly etichetta: string;
}

/** La finestra chiesta nell'indirizzo, o quella predefinita se il valore non e' dei nostri. */
export function finestraDa(valore: string | undefined): Finestra {
  return FINESTRE.find((f) => f === valore) ?? "corrente";
}

/**
 * Il nome di una stagione dalle sue date: «2025/26» a cavallo d'anno, «2026» dentro
 * l'anno solare come in MLS o in Brasile.
 */
export function nomeDiStagione(inizio: string, fine: string): string {
  const da = new Date(inizio).getUTCFullYear();
  const a = new Date(fine).getUTCFullYear();
  if (!Number.isFinite(da) || !Number.isFinite(a)) return "";
  return da === a ? String(da) : `${da}/${String(a).slice(2)}`;
}

/**
 * Quali stagioni guardare, per una competizione e una finestra.
 *
 * Senza livello dati non si inventa una finestra: si torna quella della gara, che e' il
 * comportamento di sempre, e le letture decideranno da sole di non comparire.
 */
export async function stagioniScelte(
  competitionSourceId: number,
  seasonSourceId: number,
  finestra: Finestra,
): Promise<StagioniScelte> {
  const sql = connessione();
  if (sql === null) {
    return { finestra: "corrente", stagioni: [seasonSourceId], etichetta: "questa stagione" };
  }
  const righe = await sql<{ source_id: string; starts_on: string; ends_on: string }[]>`
    select s.source_id::text, s.starts_on::text, s.ends_on::text
    from football.seasons s
    join football.competitions c on c.id = s.competition_id
    where c.source_id = ${competitionSourceId}::bigint
      and s.starts_on <= (
        select s2.starts_on from football.seasons s2
        join football.competitions c2 on c2.id = s2.competition_id
        where c2.source_id = ${competitionSourceId}::bigint
          and s2.source_id = ${seasonSourceId}::bigint
      )
    order by s.starts_on desc
  `;
  // La prima e' quella della gara, la seconda quella prima: l'ordine e' per data e non per
  // identificativo, perche' gli identificativi della fonte non sono ordinati nel tempo.
  const corrente = righe[0];
  const scorsa = righe[1];

  if (finestra === "scorsa") {
    return scorsa === undefined
      ? { finestra, stagioni: [], etichetta: "stagione precedente non in archivio" }
      : {
        finestra,
        stagioni: [Number(scorsa.source_id)],
        etichetta: nomeDiStagione(scorsa.starts_on, scorsa.ends_on),
      };
  }
  if (finestra === "tutto") {
    return {
      finestra,
      stagioni: righe.map((r) => Number(r.source_id)),
      etichetta: `tutto l'archivio, ${righe.length} stagioni`,
    };
  }
  return {
    finestra,
    stagioni: [seasonSourceId],
    etichetta: corrente === undefined
      ? "questa stagione"
      : nomeDiStagione(corrente.starts_on, corrente.ends_on),
  };
}
