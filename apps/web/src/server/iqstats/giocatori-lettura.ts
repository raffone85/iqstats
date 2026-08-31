// Server-only: chi rischia il cartellino e chi puo' segnare, in questa gara.
//
// **Non e' una probabilita' ed e' scritto ovunque.** Per ogni giocatore si prende il suo
// passo in questa stagione, si guarda in quale quinto del campionato cade, e si dice quante
// volte quel quinto ha poi preso il giallo o segnato. E' una frequenza osservata su un
// campione dichiarato, non una stima tarata: la taratura e' la fase 2 di
// `tasks/giocatori-cartellini-e-marcatori.md` e finche' non c'e' non si mostra un numero
// che finga di essere una probabilita'.
//
// **I quinti e le frequenze arrivano da `artefatti/giocatori-base.json`**, misurato su
// 254.743 casi e 28 campionati con le medie del giocatore calcolate sulle sole gare
// precedenti. Qui si applica quella tabella, non la si ricalcola.
//
// **Il giallo e il gol non pesano uguale, e non si presentano uguale.** Misurato: il gruppo
// che tira di piu' segna circa il doppio della base del suo campionato, in tutti e 26 i
// campionati controllati; il gruppo che contrasta di piu' prende il giallo 1,25 volte la
// base, e l'ordine regge in 14 campionati su 26. La lettura del cartellino porta quindi la
// sua debolezza scritta, invece di nasconderla dietro un titolo sicuro.
//
// **Il metro e' il ruolo, dal 30 agosto 2026.** Misurato su 224.836 casi: il difensore
// prende il giallo il 16,5% delle volte e l'attaccante il 10,6%, contro una base di lega
// del 13,4%, e quell'ordine regge in 26 campionati su 27. Confrontare un difensore con la
// media del campionato lo faceva quindi risultare esposto **solo perche' e' un difensore**,
// e la lettura finiva per proporre difensori spacciando il ruolo per propensione. Ora ogni
// giocatore si confronta con quelli del suo stesso ruolo. Dove la tabella del ruolo non
// regge il campione si ripiega su quella del campionato, e la pagina lo dichiara.
import "server-only";

import { unstable_cache } from "next/cache";

import tabella from "./artefatti/giocatori-base.json" with { type: "json" };
import {
  metroDi,
  type Bersaglio,
  type Ruolo,
  type VoceLega,
} from "./giocatori-metro.ts";
import { ProviderClient } from "./provider-client.ts";

const LEGHE = (tabella as { leghe: Record<string, VoceLega> }).leghe;

// La pagina importa da qui, non dal modulo puro: il confine del prodotto resta uno solo.
export { isRuolo } from "./giocatori-metro.ts";
export type { Ruolo } from "./giocatori-metro.ts";

/** Una voce del dettaglio: il numero per novanta minuti e il totale da cui esce. */
export interface StatisticaGiocatore {
  readonly etichetta: string;
  readonly per90: number;
  readonly totale: number;
  /** Vero per il numero che ha scelto questo giocatore: in pagina si riconosce. */
  readonly scelto?: boolean;
}

export interface Candidato {
  readonly id: number;
  readonly nome: string;
  readonly squadra: string;
  /** Come si chiama il numero che l'ha scelto, per esteso. */
  readonly fattore: string;
  /** Il suo valore, gia' arrotondato per la lettura. */
  readonly valore: number;
  /** In quale gruppo cade, e su quanti gruppi. */
  readonly gruppo: number;
  readonly gruppi: number;
  /** Quante volte quel gruppo ha poi preso il giallo o segnato, e su quanti casi. */
  readonly frequenza: number;
  readonly casi: number;
  /** La probabilita' tarata: quella che la pagina mostra come numero grosso. */
  readonly stima: number;
  /** La stessa stima per chi sta al centro del suo ruolo, per il confronto. */
  readonly stimaBase: number;
  /** Di quanti punti percentuali la stima puo' sbagliare, misurato fuori periodo. */
  readonly incertezza: number;
  /** Tutto quello che si sa del suo passo in questa stagione, per il dettaglio. */
  readonly statistiche: readonly StatisticaGiocatore[];
  /** La base del confronto: quella del suo ruolo dove regge, altrimenti del campionato. */
  readonly base: number;
  /** Con chi e' stato confrontato, gia' con la preposizione giusta per le due frasi. */
  readonly metro: { readonly fra: string; readonly dei: string };
  /** Falso quando il ruolo non bastava e si e' ripiegato sul campionato. */
  readonly metroDelRuolo: boolean;
  /** Su quante gare e quanti minuti poggia il suo passo. */
  readonly gare: number;
  readonly minuti: number;
}

export interface LetturaGiocatori {
  readonly cartellini: readonly Candidato[];
  readonly marcatori: readonly Candidato[];
  /** Gare della stagione da cui esce il passo dei giocatori. */
  readonly gareStagione: number;
  /** Quante di quelle gare hanno davvero portato statistiche per giocatore. */
  readonly gareConDato: number;
  readonly base: { readonly giallo: number; readonly gol: number };
  /** Il campione su cui la tabella del campionato e' stata misurata. */
  readonly campioneTabella: { readonly gare: number; readonly casi: number };
}

function resolveProviderConfig(): { baseUrl: string; token: string } | null {
  const token = (process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN ?? "").trim();
  if (!token) return null;
  const baseUrl =
    process.env.IQSTATS_PROVIDER_BASE_URL?.trim() ||
    process.env.BSD_API_BASE_URL?.trim() ||
    DEFAULT_PROVIDER_BASE_URL;
  return { baseUrl, token };
}

const DEFAULT_PROVIDER_BASE_URL = "https://sports.bzzoiro.com/api/v2/";
/** Un'ora: le gare gia' finite non cambiano, e il passo di un giocatore nemmeno. */
const CACHE_TTL_SECONDS = 3600;
/** Sotto novanta minuti giocati un per-novanta non e' un tasso: e' la stessa soglia
 *  della tabella di base, e cambiarla qui la renderebbe incoerente. */
const MIN_MINUTI = 90;
/**
 * La forma del dato messo in cache, non la versione del prodotto.
 *
 * Scoperto guardando la cattura il 30 agosto 2026: cambiando `metro` da stringa a coppia
 * di frasi, la pagina ha continuato a leggere per un'ora la forma vecchia e a stampare il
 * vuoto al posto del confronto. La chiave non conteneva niente che distinguesse le due
 * forme. **Si alza a ogni cambio di forma di `LetturaGiocatori`**, altrimenti il difetto
 * torna identico e si vede solo in pagina.
 */
const VERSIONE_LETTURA = 3;
/** Quanti nomi mostra una lettura. Quattro come i blocchi, non di piu': una lista lunga
 *  non e' una lettura, e' un elenco. */
const QUANTI = 4;

/** In quale gruppo cade un valore, dati i tagli. Stesso calcolo della tabella. */
function gruppoDi(valore: number, tagli: readonly number[]): number {
  let g = 0;
  while (g < tagli.length && valore >= tagli[g]) g += 1;
  return g;
}

type Passo = {
  minuti: number; gare: number;
  contrasti: number; falli: number; tiri: number; xg: number;
  // Il dettaglio che si apre non chiede niente in piu' alla fonte: sono campi delle stesse
  // righe gia' scaricate per i due numeri di sopra.
  gol: number; inPorta: number; gialli: number; falliSubiti: number;
  contrastiVinti: number; duelliVinti: number; duelliPersi: number; passaggiChiave: number;
  nome: string; squadra: string; ruolo: Ruolo | null;
};

/** I numeri del giocatore, per novanta minuti, nell'ordine in cui si leggono. */
const VOCI: readonly (readonly [keyof Passo, string])[] = [
  ["gol", "gol"],
  ["tiri", "tiri"],
  ["inPorta", "tiri in porta"],
  ["xg", "gol attesi"],
  ["passaggiChiave", "passaggi chiave"],
  ["gialli", "cartellini gialli"],
  ["falli", "falli commessi"],
  ["falliSubiti", "falli subiti"],
  ["contrasti", "contrasti"],
  ["contrastiVinti", "contrasti vinti"],
  ["duelliVinti", "duelli vinti"],
  ["duelliPersi", "duelli persi"],
];

function statistiche(p: Passo, campoScelto: keyof Passo): readonly StatisticaGiocatore[] {
  return VOCI.map(([campo, etichetta]) => {
    const totale = p[campo] as number;
    return {
      etichetta,
      per90: Math.round(((90 * totale) / p.minuti) * 100) / 100,
      totale: Math.round(totale * 100) / 100,
      ...(campo === campoScelto ? { scelto: true } : {}),
    };
  });
}

function candidati(
  passi: ReadonlyMap<number, Passo>,
  bersaglio: Bersaglio,
  campo: keyof Passo,
  etichetta: string,
): readonly Candidato[] {
  // **Un fattore solo, ed e' quello tarato.** Fino al 30 agosto se ne provavano due e
  // vinceva quello che portava il giocatore piu' in alto: andava bene per una frequenza
  // osservata, non per una probabilita'. I quattro fattori di uno stesso bersaglio dicono
  // in gran parte la stessa cosa, e solo uno di loro e' stato misurato fuori periodo: gli
  // altri restano nel dettaglio come numeri del giocatore, non come metro.
  const chiaveFattore = bersaglio.fattore_tarato;
  const incertezza = bersaglio.incertezza_punti ?? 0;
  if (chiaveFattore === undefined) return [];
  const fuori: Candidato[] = [];
  for (const [id, p] of passi) {
    if (p.minuti < MIN_MINUTI) continue;
    // **Il metro si sceglie una volta per giocatore, non per fattore.** Se il suo ruolo ha
    // una tabella che regge il campione, tutti i suoi confronti avvengono li' dentro;
    // altrimenti tutti sul campionato. Mescolare i due metri sullo stesso nome renderebbe
    // il numero incomparabile con quello del nome sopra.
    const { conRuolo, base, stimaBase, metro, fattori } = metroDi(bersaglio, p.ruolo);
    const fattore = fattori[chiaveFattore];
    if (!fattore) continue;
    const valore = (90 * (p[campo] as number)) / p.minuti;
    const indice = gruppoDi(valore, fattore.tagli);
    const gruppo = fattore.gruppi.find((g) => g.gruppo === indice + 1);
    // Senza la stima tarata non si mostra un numero: l'artefatto e' vecchio, e un numero
    // vecchio accanto a un nome vale meno di nessun numero.
    if (!gruppo || gruppo.stima === undefined) continue;
    fuori.push({
      id, nome: p.nome, squadra: p.squadra,
      fattore: etichetta,
      valore: Math.round(valore * 100) / 100,
      gruppo: indice + 1,
      gruppi: fattore.gruppi.length,
      frequenza: gruppo.frequenza,
      casi: gruppo.casi,
      stima: gruppo.stima,
      stimaBase,
      incertezza,
      base,
      metro,
      metroDelRuolo: conRuolo,
      gare: p.gare,
      minuti: Math.round(p.minuti),
      statistiche: statistiche(p, campo),
    });
  }
  // **Si ordina per quanto sorprende, non per quanto e' alto.** Con il metro del ruolo le
  // stime grezze non sono piu' confrontabili fra ruoli diversi: un difensore parte dal 16%
  // e un attaccante dall'11%, quindi ordinare sulla stima rimetterebbe in cima i difensori,
  // che e' esattamente il difetto che questa misura ha corretto. Si ordina sullo scarto dal
  // proprio metro.
  fuori.sort((a, b) => b.stima - b.stimaBase - (a.stima - a.stimaBase) || b.valore - a.valore);
  return fuori.slice(0, QUANTI);
}

async function leggi(
  leagueId: number,
  seasonId: number | null,
  ammessi: ReadonlyMap<number, { nome: string; squadra: string; ruolo: Ruolo | null }>,
): Promise<LetturaGiocatori | null> {
  const voce = LEGHE[String(leagueId)];
  if (!voce) return null;
  const config = resolveProviderConfig();
  if (!config) return null;
  const client = new ProviderClient({ baseUrl: config.baseUrl, token: config.token });

  const elenco = (await client.getJson(
    `/api/v2/events/?league=${leagueId}&status=finished&limit=200&offset=0`,
  )) as { results?: readonly Record<string, unknown>[] } | null;
  const gare = (elenco?.results ?? []).filter(
    (g) => seasonId === null || g.season_id === seasonId,
  );
  if (gare.length === 0) return null;

  const passi = new Map<number, Passo>();
  let gareConDato = 0;
  for (const gara of gare) {
    const id = gara.id;
    if (typeof id !== "number") continue;
    const stat = (await client.getJson(
      `/api/v2/events/${id}/player-stats/`,
    )) as { player_stats?: readonly Record<string, unknown>[]; results?: readonly Record<string, unknown>[] } | null;
    const righe = (stat?.player_stats ?? stat?.results ?? []).filter(
      (r) => typeof r.minutes_played === "number" && r.minutes_played > 0,
    );
    if (righe.length === 0) continue;
    gareConDato += 1;
    for (const r of righe) {
      const pid = r.player_id;
      const chi = typeof pid === "number" ? ammessi.get(pid) : undefined;
      if (typeof pid !== "number" || chi === undefined) continue;
      const p = passi.get(pid) ?? {
        minuti: 0, gare: 0, contrasti: 0, falli: 0, tiri: 0, xg: 0,
        gol: 0, inPorta: 0, gialli: 0, falliSubiti: 0,
        contrastiVinti: 0, duelliVinti: 0, duelliPersi: 0, passaggiChiave: 0,
        nome: chi.nome, squadra: chi.squadra, ruolo: chi.ruolo,
      };
      p.minuti += Number(r.minutes_played) || 0;
      p.gare += 1;
      p.contrasti += Number(r.total_tackle) || 0;
      p.falli += Number(r.fouls) || 0;
      p.tiri += Number(r.total_shots) || 0;
      // xG e' nullo esattamente quando i tiri sono zero: li' vale zero, mai mancante.
      p.xg += Number(r.expected_goals) || 0;
      p.gol += Number(r.goals) || 0;
      p.inPorta += Number(r.shots_on_target) || 0;
      // Il giallo sulle righe per giocatore e' un sottoinsieme di quello degli episodi -
      // ne perde il 38,4% - ma qui non e' un'etichetta da prevedere: e' il passato del
      // giocatore, e sotto conta e' meglio che assente.
      p.gialli += Number(r.yellow_card) || 0;
      p.falliSubiti += Number(r.was_fouled) || 0;
      p.contrastiVinti += Number(r.won_tackle) || 0;
      p.duelliVinti += Number(r.duel_won) || 0;
      p.duelliPersi += Number(r.duel_lost) || 0;
      p.passaggiChiave += Number(r.key_pass) || 0;
      passi.set(pid, p);
    }
  }
  if (passi.size === 0) return null;

  // Dove i falli sono un campo presente e sempre a zero non c'e' fattore, e senza fattore
  // la lettura del cartellino non esiste: meglio la sezione assente di una sezione che
  // ordina i nomi con un numero vuoto.
  return {
    cartellini: voce.falli_utilizzabili
      ? candidati(passi, voce.giallo, "falli", "falli")
      : [],
    marcatori: candidati(passi, voce.gol, "tiri", "tiri"),
    gareStagione: gare.length,
    gareConDato,
    base: { giallo: voce.giallo.base, gol: voce.gol.base },
    campioneTabella: { gare: voce.gare, casi: voce.casi },
  };
}

/**
 * La lettura per una gara. `rosa` sono gli identificativi di chi ci si aspetta in campo:
 * senza formazione non c'e' lettura, perche' nominare chi non gioca sarebbe peggio che
 * tacere.
 */
export async function letturaGiocatori(
  matchId: number,
  leagueId: number,
  seasonId: number | null,
  rosa: readonly {
    readonly id: number;
    readonly nome: string;
    readonly squadra: string;
    /** Dalla formazione, che porta gia' `position`: nessuna chiamata in piu'. */
    readonly ruolo: Ruolo | null;
  }[],
): Promise<LetturaGiocatori | null> {
  if (rosa.length === 0) return null;
  const ammessi = new Map(
    rosa.map((g) => [g.id, { nome: g.nome, squadra: g.squadra, ruolo: g.ruolo }]),
  );
  const chiave = `giocatori-lettura:v${VERSIONE_LETTURA}:${matchId}:${leagueId}:${seasonId ?? "x"}`;
  return unstable_cache(() => leggi(leagueId, seasonId, ammessi), [chiave], {
    revalidate: CACHE_TTL_SECONDS,
    tags: [`giocatori-lettura-${matchId}`],
  })();
}

/** Se un campionato ha una tabella di base misurata. Fuori da qui la sezione non esiste. */
export function haTabellaDiBase(leagueId: number): boolean {
  return Object.hasOwn(LEGHE, String(leagueId));
}
