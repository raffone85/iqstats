// Gli uomini della gara: chi segna e chi prende i gialli, nelle due rose che scendono in
// campo.
//
// **Da dove vengono i numeri.** Dalla rosa di stagione della fonte, la stessa lettura che
// la scheda squadra usa gia': una chiamata per squadra, in cache. Porta minuti, presenze,
// rating per gara e i totali stagionali, fra cui gol, gol attesi, gialli e falli. Non si
// aggiunge nessuna raccolta nuova.
//
// **Perche' i gol attesi stanno accanto ai gol.** Con poche giornate i gol di un
// attaccante sono un campione minuscolo: due gol in tre gare non dicono «ne fa uno ogni
// gara e mezza». I gol attesi sono la stessa storia con meno rumore, e si mostrano
// accanto, non al posto: chi legge vede tutte e due e decide.
//
// **Un'assenza resta un'assenza.** Un giocatore senza minuti sufficienti non entra in
// classifica, e una metrica che la fonte non espone non diventa zero: la riga esce senza
// quel numero, e la sezione dichiara quanti giocatori ha potuto misurare.
import "server-only";

import type { SquadPosition, TeamSquadEntry } from "@iqstats/shared";

import { getTeamSquad, type TeamSelection } from "./team-page.ts";

/** Minuti minimi di stagione perche' un giocatore entri in classifica. */
const MINUTI_MINIMI = 180;

/**
 * Quante gare pesa la media della rosa quando si corregge il rating di un giocatore.
 *
 * **Perche' si corregge.** Il rating della fonte e' una media, e a inizio stagione poggia
 * su tre o quattro gare: una prestazione fuori scala la sposta di mezzo punto. Avvicinarla
 * alla media della sua rosa - poco, in proporzione a quanto e' piccolo il campione - la
 * rende piu' affidabile senza inventare niente: e' il valore che gia' c'e', pesato.
 *
 * **Il peso non e' scelto a occhio.** Misurato il 18 settembre 2026 su 11.983
 * stagioni-giocatore del nostro livello dati, dividendo ogni stagione a meta' e usando la
 * prima per prevedere la seconda: con un prior da tre gare l'errore scende del 3,5% sui
 * tiri in porta per 90' e del 5,3% sui gialli. A cinque gare i tiri peggiorano, a zero
 * sbaglia di piu' tutto. Tre e' il compromesso che regge su entrambe le scale.
 *
 * La media grezza resta scritta accanto, con il suo campione: la correzione si dichiara.
 */
const GARE_DI_PRIOR = 3;

/** Quanti nomi per lista: oltre il quinto la lista smette di essere una lettura. */
const QUANTI = 5;

export interface UomoDellaGara {
  readonly giocatoreId: string;
  readonly nome: string;
  readonly ruolo: SquadPosition | null;
  readonly presenze: number;
  readonly minuti: number;
  /** Il rating medio della fonte e su quante gare poggia. `null` dove non lo espone. */
  readonly rating: number | null;
  readonly gareDiRating: number;
  /** Lo stesso rating avvicinato alla media della rosa, in proporzione al campione. */
  readonly ratingCorretto: number | null;
  /** Per novanta minuti: `null` dove la fonte non espone la metrica. */
  readonly per90: number | null;
  /** Il totale stagionale della stessa metrica, perche' un rapporto senza il suo conteggio inganna. */
  readonly totale: number | null;
  /** La seconda misura della riga: gol attesi per i marcatori, falli per gli ammoniti. */
  readonly accanto: number | null;
}

export interface LatoDegliUomini {
  readonly squadra: string;
  readonly squadraId: string;
  readonly misurati: number;
  readonly inRosa: number;
  /** La media dei rating della rosa: e' il riferimento verso cui si corregge. */
  readonly mediaRating: number | null;
  readonly marcatori: readonly UomoDellaGara[];
  readonly ammoniti: readonly UomoDellaGara[];
}

export interface UominiDellaGara {
  readonly casa: LatoDegliUomini;
  readonly trasferta: LatoDegliUomini;
  readonly minutiMinimi: number;
}

function per90(totale: number | null, minuti: number): number | null {
  if (totale === null || minuti <= 0) return null;
  return (totale / minuti) * 90;
}

function valoreRating(entry: TeamSquadEntry): { rating: number | null; gare: number } {
  const stats = entry.stats;
  if (stats === null) return { rating: null, gare: 0 };
  const campo = stats.rating;
  // `unavailable` non porta un valore: si dichiara, non si stima.
  const rating = campo.status === "available" || campo.status === "stale" ? campo.value : null;
  return { rating, gare: stats.ratingSample };
}

/**
 * La media dei rating della rosa, pesata sulle gare di ciascuno.
 *
 * E' il punto verso cui si tira il rating di chi ha giocato poco. `null` quando la fonte
 * non espone nessun rating: senza un riferimento non si corregge niente.
 */
function mediaDeiRating(entries: readonly TeamSquadEntry[]): number | null {
  let somma = 0;
  let gare = 0;
  for (const entry of entries) {
    const { rating, gare: n } = valoreRating(entry);
    if (rating === null || n <= 0) continue;
    somma += rating * n;
    gare += n;
  }
  return gare === 0 ? null : somma / gare;
}

function uomo(
  entry: TeamSquadEntry,
  metrica: "goals" | "yellowCard",
  accantoA: "expectedGoals" | "fouls",
  mediaRosa: number | null,
): UomoDellaGara | null {
  const stats = entry.stats;
  if (stats === null || stats.minutes < MINUTI_MINIMI) return null;
  const { rating, gare } = valoreRating(entry);
  const totale = stats.totals[metrica] ?? null;
  return {
    giocatoreId: entry.profile.playerId,
    nome: entry.profile.name,
    ruolo: entry.profile.position,
    presenze: stats.appearances,
    minuti: stats.minutes,
    rating,
    gareDiRating: gare,
    ratingCorretto: rating === null || mediaRosa === null || gare <= 0
      ? rating
      : (rating * gare + mediaRosa * GARE_DI_PRIOR) / (gare + GARE_DI_PRIOR),
    per90: per90(totale, stats.minutes),
    totale,
    accanto: per90(stats.totals[accantoA] ?? null, stats.minutes),
  };
}

/**
 * I primi `QUANTI` per quella metrica, e solo quelli che ce l'hanno davvero.
 *
 * L'ordine e' sul valore per novanta minuti; a parita' vince chi ha piu' minuti, perche'
 * lo stesso rapporto su un campione piu' largo e' la lettura piu' solida.
 */
function primi(
  rose: readonly TeamSquadEntry[],
  metrica: "goals" | "yellowCard",
  accantoA: "expectedGoals" | "fouls",
  mediaRosa: number | null,
): readonly UomoDellaGara[] {
  return rose
    .map((entry) => uomo(entry, metrica, accantoA, mediaRosa))
    .filter((v): v is UomoDellaGara => v !== null && v.per90 !== null && v.per90 > 0)
    .sort((a, b) => (b.per90 ?? 0) - (a.per90 ?? 0) || b.minuti - a.minuti)
    .slice(0, QUANTI);
}

async function latoDegliUomini(
  squadra: string,
  squadraId: string,
  selezione: TeamSelection,
): Promise<LatoDegliUomini | null> {
  const envelope = await getTeamSquad(squadraId, selezione);
  const entries = envelope?.data?.entries ?? null;
  if (entries === null) return null;
  const misurati = entries.filter(
    (e) => e.stats !== null && e.stats.minutes >= MINUTI_MINIMI,
  ).length;
  const mediaRosa = mediaDeiRating(entries);
  return {
    squadra,
    squadraId,
    inRosa: entries.length,
    misurati,
    mediaRating: mediaRosa,
    marcatori: primi(entries, "goals", "expectedGoals", mediaRosa),
    ammoniti: primi(entries, "yellowCard", "fouls", mediaRosa),
  };
}

/**
 * Le due rose della gara in arrivo, gia' ordinate.
 *
 * `null` quando la fonte non da' nemmeno una delle due: mezza sezione direbbe che una
 * squadra non ha uomini pericolosi, che e' una bugia con l'aria di un dato.
 */
export async function uominiDellaGara(
  casa: { readonly nome: string; readonly id: string },
  trasferta: { readonly nome: string; readonly id: string },
  selezione: TeamSelection,
): Promise<UominiDellaGara | null> {
  const [unoCasa, unaTrasferta] = await Promise.all([
    latoDegliUomini(casa.nome, casa.id, selezione),
    latoDegliUomini(trasferta.nome, trasferta.id, selezione),
  ]);
  if (unoCasa === null || unaTrasferta === null) return null;
  return { casa: unoCasa, trasferta: unaTrasferta, minutiMinimi: MINUTI_MINIMI };
}
