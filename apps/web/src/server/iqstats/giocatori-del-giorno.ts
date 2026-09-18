// Server-only: i giocatori delle gare di oggi, filtrati sulle soglie che sceglie chi legge.
//
// **Da dove vengono i numeri.** Dalla rosa di stagione della fonte, la stessa lettura di
// «Gli uomini» nel dossier: una per squadra, in cache, nessun traffico sul nostro database.
// I per 90' sono corretti sul campione verso la media della rosa, con lo stesso peso misurato
// il 18 settembre 2026; il grezzo resta accanto.
//
// **Nessun filtro sul ritardo dal giallo.** Misurato su 162.934 casi: a parita' di gialli per
// 90', chi e' da piu' gare senza giallo ne prende meno, non di piu'. Il fatto resta scritto
// nella riga, il filtro non esiste. Piano e misure in `tasks/filtro-giocatori-del-giorno.md`.
import "server-only";

import type { PlayerMetricKey, SquadPosition, TeamSquadEntry } from "@iqstats/shared";
import { unstable_cache } from "next/cache";

import { getMatchesByDate, type MatchListItem } from "./matches.ts";
import { getTeamSquad } from "./team-page.ts";
import { mediaDellaRosa, per90, per90Corretto } from "./uomini-gara.ts";

/** Le gare che non sono ancora cominciate: gli stessi stati della scheda «Da giocare». */
const DA_GIOCARE = new Set(["notstarted", "upcoming", "delayed"]);
/** Rose lette insieme: ogni rosa costa gia' fino a quattro richieste parallele. */
const ROSE_INSIEME = 12;
/** Il minimo del cursore dei minuti in pagina: sotto, un giocatore non serve in cache. */
export const MINUTI_IN_CACHE = 90;
/** Oltre questo numero la lista smette di essere una lettura. */
export const MOSTRATI = 40;

export interface Soglia {
  readonly chiave: string;
  readonly metrica: PlayerMetricKey;
  readonly nome: string;
  readonly massimo: number;
  readonly passo: number;
  readonly predefinita: number;
}

export interface Scheda {
  readonly chiave: string;
  readonly nome: string;
  /** La prima soglia e' la metrica che ordina: chi non l'ha mai fatta resta fuori. */
  readonly soglie: readonly Soglia[];
}

export const SCHEDE: readonly Scheda[] = [
  {
    chiave: "marcatori",
    nome: "Marcatori",
    soglie: [
      { chiave: "gol", metrica: "goals", nome: "Gol ogni 90'", massimo: 1.2, passo: 0.05, predefinita: 0.2 },
      { chiave: "xg", metrica: "expectedGoals", nome: "Gol attesi ogni 90'", massimo: 1.2, passo: 0.05, predefinita: 0 },
      { chiave: "porta", metrica: "shotsOnTarget", nome: "Tiri in porta ogni 90'", massimo: 3, passo: 0.1, predefinita: 0 },
    ],
  },
  {
    chiave: "ammoniti",
    nome: "Probabili ammoniti",
    soglie: [
      { chiave: "gialli", metrica: "yellowCard", nome: "Gialli ogni 90'", massimo: 1, passo: 0.05, predefinita: 0.2 },
      { chiave: "falli", metrica: "fouls", nome: "Falli commessi ogni 90'", massimo: 4, passo: 0.1, predefinita: 0 },
    ],
  },
  {
    chiave: "falli",
    nome: "Falli commessi",
    soglie: [
      { chiave: "falli", metrica: "fouls", nome: "Falli commessi ogni 90'", massimo: 4, passo: 0.1, predefinita: 1.5 },
    ],
  },
  {
    chiave: "subiti",
    nome: "Falli subiti",
    soglie: [
      { chiave: "subiti", metrica: "wasFouled", nome: "Falli subiti ogni 90'", massimo: 5, passo: 0.1, predefinita: 1.5 },
    ],
  },
];

export const RUOLI: readonly { readonly chiave: SquadPosition; readonly nome: string }[] = [
  { chiave: "forward", nome: "Attaccanti" },
  { chiave: "midfielder", nome: "Centrocampisti" },
  { chiave: "defender", nome: "Difensori" },
  { chiave: "goalkeeper", nome: "Portieri" },
];

export interface Richiesta {
  readonly scheda: Scheda;
  /** Una per soglia della scheda, nello stesso ordine. 0 vuol dire «non filtrare». */
  readonly valori: readonly number[];
  readonly minutiMinimi: number;
  readonly ruolo: SquadPosition | null;
  readonly leagueId: number | null;
}

export interface Misura {
  readonly nome: string;
  readonly corretto: number;
  readonly grezzo: number;
  readonly totale: number | null;
  /** Vero se questa misura ha una soglia sopra lo zero, e la supera: e' il «perche'». */
  readonly scelta: boolean;
}

export interface GiocatoreDelGiorno {
  readonly giocatoreId: string;
  readonly nome: string;
  readonly ruolo: SquadPosition | null;
  readonly squadra: string;
  readonly avversario: string;
  readonly casa: boolean;
  readonly gara: { readonly id: number; readonly inizio: string; readonly lega: string | null };
  readonly minuti: number;
  readonly presenze: number;
  readonly misure: readonly Misura[];
  /** Solo per i gialli: presenze dall'ultimo, `null` se nelle gare lette non ne ha. */
  readonly ultimoGiallo: number | null;
}

export interface GiocatoriDelGiorno {
  readonly data: string;
  readonly gare: number;
  readonly rose: number;
  /** Rose che la fonte non ha dato: le squadre restano fuori, e il numero si dichiara. */
  readonly roseMancanti: number;
  /** Tutti quelli che passano i filtri; la pagina ne mostra i primi `MOSTRATI`. */
  readonly trovati: readonly GiocatoreDelGiorno[];
  /** L'elenco gare non e' completo (fonte giu' o freno di sicurezza): va detto. */
  readonly elencoParziale: boolean;
}

interface Lato {
  readonly gara: MatchListItem;
  readonly squadraId: number;
  readonly casa: boolean;
}

/** Le metriche che le schede leggono: solo queste entrano nel riassunto in cache. */
const METRICHE = [...new Set(SCHEDE.flatMap((s) => s.soglie.map((soglia) => soglia.metrica)))];

/** Il giocatore ridotto a quello che serve al filtro. */
interface Riassunto {
  readonly id: string;
  readonly nome: string;
  readonly ruolo: SquadPosition | null;
  readonly minuti: number;
  readonly presenze: number;
  readonly ultimoGiallo: number | null;
  readonly totali: Partial<Record<PlayerMetricKey, number | null>>;
}

interface RosaRiassunta {
  /** La media della rosa per ogni metrica: il riferimento della correzione sul campione. */
  readonly medie: Partial<Record<PlayerMetricKey, number | null>>;
  readonly giocatori: readonly Riassunto[];
}

function riassumi(entries: readonly TeamSquadEntry[]): RosaRiassunta {
  return {
    medie: Object.fromEntries(METRICHE.map((m) => [m, mediaDellaRosa(entries, m)])),
    giocatori: entries.flatMap((entry) => {
      const stats = entry.stats;
      // Sotto il minimo del cursore dei minuti nessuno entra mai: non si tiene in cache.
      if (stats === null || stats.minutes < MINUTI_IN_CACHE) return [];
      return [{
        id: entry.profile.playerId,
        nome: entry.profile.name,
        ruolo: entry.profile.position,
        minuti: stats.minutes,
        presenze: stats.appearances,
        ultimoGiallo: stats.appearancesSinceYellow,
        totali: Object.fromEntries(METRICHE.map((m) => [m, stats.totals[m] ?? null])),
      }];
    }),
  };
}

/**
 * La rosa riassunta, in cache per mezz'ora.
 *
 * **Perche' una cache sopra la cache.** Con 249 gare la pagina leggeva 498 rose, e ognuna
 * rileggeva e ricomponeva i payload di tutte le sue gare: misurato il 18/09/2026, 6,8 s a
 * ogni richiesta anche con la fonte gia' in cache. Il riassunto sono pochi numeri per
 * giocatore; filtrarlo e' un conto in memoria. Una rosa che non arriva lancia, cosi' il
 * fallimento non resta in cache per mezz'ora.
 */
function rosaRiassunta(squadraId: number, leagueId: number, seasonId: number): Promise<RosaRiassunta> {
  return unstable_cache(async () => {
    const envelope = await getTeamSquad(String(squadraId), {
      leagueId: String(leagueId),
      seasonId: String(seasonId),
    });
    const entries = envelope?.data?.entries ?? null;
    if (entries === null) throw new Error("rosa non disponibile");
    return riassumi(entries);
  }, ["giocatori-del-giorno", String(squadraId), String(leagueId), String(seasonId)], {
    revalidate: 30 * 60,
  })();
}

function candidati(
  rosa: RosaRiassunta,
  lato: Lato,
  richiesta: Richiesta,
): GiocatoreDelGiorno[] {
  const { gara, casa } = lato;
  const trovati: GiocatoreDelGiorno[] = [];
  for (const g of rosa.giocatori) {
    if (g.minuti < richiesta.minutiMinimi) continue;
    if (richiesta.ruolo !== null && g.ruolo !== richiesta.ruolo) continue;
    const misure: Misura[] = [];
    let passa = true;
    richiesta.scheda.soglie.forEach((soglia, i) => {
      const valore = richiesta.valori[i] ?? 0;
      const totale = g.totali[soglia.metrica] ?? null;
      const grezzo = per90(totale, g.minuti);
      const corretto = per90Corretto(grezzo, g.minuti, rosa.medie[soglia.metrica] ?? null);
      // Una metrica che la fonte non espone non diventa zero: con una soglia attiva, o se e'
      // la metrica che ordina, il giocatore esce; altrimenti la misura non si scrive.
      if (grezzo === null || corretto === null) {
        if (valore > 0 || i === 0) passa = false;
        return;
      }
      // Chi non l'ha mai fatto resta fuori dalla metrica che ordina: la correzione lo
      // porterebbe sopra zero solo perche' i compagni la fanno.
      if (i === 0 && grezzo <= 0) passa = false;
      if (valore > 0 && corretto < valore) passa = false;
      misure.push({ nome: soglia.nome, corretto, grezzo, totale, scelta: valore > 0 });
    });
    if (!passa) continue;
    trovati.push({
      giocatoreId: g.id,
      nome: g.nome,
      ruolo: g.ruolo,
      squadra: casa ? gara.homeTeam : gara.awayTeam,
      avversario: casa ? gara.awayTeam : gara.homeTeam,
      casa,
      gara: { id: gara.eventId, inizio: gara.kickoff, lega: gara.leagueName },
      minuti: g.minuti,
      presenze: g.presenze,
      misure,
      ultimoGiallo: richiesta.scheda.chiave === "ammoniti" ? g.ultimoGiallo : null,
    });
  }
  return trovati;
}

/** Le gare di oggi non ancora cominciate, e le leghe che le giocano: servono al modulo. */
export async function gareDaGiocareOggi(): Promise<{
  readonly data: string;
  readonly gare: readonly MatchListItem[];
  readonly leghe: readonly { readonly id: number; readonly nome: string }[];
  readonly parziale: boolean;
}> {
  const data = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const elenco = await getMatchesByDate(data);
  const gare = elenco.matches.filter(
    (m) => DA_GIOCARE.has(m.status) && m.leagueId !== null && m.seasonId !== null,
  );
  const leghe = [...new Map(gare.map((m) => [m.leagueId!, m.leagueName ?? "Competizione " + m.leagueId]))]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  return { data, gare, leghe, parziale: elenco.source === "unavailable" || elenco.truncated === true };
}

export async function giocatoriDelGiorno(richiesta: Richiesta): Promise<GiocatoriDelGiorno> {
  const oggi = await gareDaGiocareOggi();
  const gare = oggi.gare.filter(
    (m) => richiesta.leagueId === null || m.leagueId === richiesta.leagueId,
  );

  const lati: Lato[] = gare.flatMap((gara) => [
    ...(gara.homeTeamId !== null ? [{ gara, squadraId: gara.homeTeamId, casa: true }] : []),
    ...(gara.awayTeamId !== null ? [{ gara, squadraId: gara.awayTeamId, casa: false }] : []),
  ]);

  const trovati: GiocatoreDelGiorno[] = [];
  let roseMancanti = gare.length * 2 - lati.length;
  for (let i = 0; i < lati.length; i += ROSE_INSIEME) {
    const gruppo = lati.slice(i, i + ROSE_INSIEME);
    const rose = await Promise.all(gruppo.map((lato) =>
      rosaRiassunta(lato.squadraId, lato.gara.leagueId!, lato.gara.seasonId!).catch(() => null)));
    rose.forEach((rosa, j) => {
      if (rosa === null) {
        roseMancanti += 1;
        return;
      }
      trovati.push(...candidati(rosa, gruppo[j]!, richiesta));
    });
  }

  // Ordine sulla metrica della scheda; a parita' vince il campione piu' largo.
  trovati.sort((a, b) =>
    (b.misure[0]?.corretto ?? 0) - (a.misure[0]?.corretto ?? 0) || b.minuti - a.minuti);

  return {
    data: oggi.data,
    gare: gare.length,
    rose: lati.length,
    roseMancanti,
    trovati,
    elencoParziale: oggi.parziale,
  };
}
