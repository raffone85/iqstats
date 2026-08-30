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
import "server-only";

import { unstable_cache } from "next/cache";

import tabella from "./artefatti/giocatori-base.json" with { type: "json" };
import { ProviderClient } from "./provider-client.ts";

const DEFAULT_PROVIDER_BASE_URL = "https://sports.bzzoiro.com/api/v2/";
/** Un'ora: le gare gia' finite non cambiano, e il passo di un giocatore nemmeno. */
const CACHE_TTL_SECONDS = 3600;
/** Sotto novanta minuti giocati un per-novanta non e' un tasso: e' la stessa soglia
 *  della tabella di base, e cambiarla qui la renderebbe incoerente. */
const MIN_MINUTI = 90;
/** Quanti nomi mostra una lettura. Quattro come i blocchi, non di piu': una lista lunga
 *  non e' una lettura, e' un elenco. */
const QUANTI = 4;

type Fattore = { readonly tagli: readonly number[]; readonly gruppi: readonly { readonly gruppo: number; readonly frequenza: number; readonly casi: number }[] };
type Bersaglio = { readonly base: number; readonly fattori: Record<string, Fattore | undefined> };
type VoceLega = { readonly gare: number; readonly casi: number; readonly falli_utilizzabili: boolean; readonly giallo: Bersaglio; readonly gol: Bersaglio };

const LEGHE = (tabella as { leghe: Record<string, VoceLega> }).leghe;

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
  /** La base del campionato, per il confronto. */
  readonly base: number;
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

/** In quale gruppo cade un valore, dati i tagli. Stesso calcolo della tabella. */
function gruppoDi(valore: number, tagli: readonly number[]): number {
  let g = 0;
  while (g < tagli.length && valore >= tagli[g]) g += 1;
  return g;
}

type Passo = {
  minuti: number; gare: number;
  contrasti: number; falli: number; tiri: number; xg: number;
  nome: string; squadra: string;
};

function candidati(
  passi: ReadonlyMap<number, Passo>,
  bersaglio: Bersaglio,
  chiavi: readonly (readonly [keyof Passo, string, string])[],
  utilizzabile: (chiave: string) => boolean,
): readonly Candidato[] {
  const fuori: Candidato[] = [];
  for (const [id, p] of passi) {
    if (p.minuti < MIN_MINUTI) continue;
    let migliore: Candidato | null = null;
    for (const [campo, chiaveFattore, etichetta] of chiavi) {
      const fattore = bersaglio.fattori[chiaveFattore];
      if (!fattore || !utilizzabile(chiaveFattore)) continue;
      const valore = (90 * (p[campo] as number)) / p.minuti;
      const indice = gruppoDi(valore, fattore.tagli);
      const gruppo = fattore.gruppi.find((g) => g.gruppo === indice + 1);
      if (!gruppo) continue;
      // Fra due fattori si tiene quello che porta il giocatore piu' in alto: e' il motivo
      // per cui compare, e mostrarne uno piu' debole nasconderebbe la ragione vera.
      if (migliore !== null && gruppo.frequenza <= migliore.frequenza) continue;
      migliore = {
        id, nome: p.nome, squadra: p.squadra,
        fattore: etichetta,
        valore: Math.round(valore * 100) / 100,
        gruppo: indice + 1,
        gruppi: fattore.gruppi.length,
        frequenza: gruppo.frequenza,
        casi: gruppo.casi,
        base: bersaglio.base,
        gare: p.gare,
        minuti: Math.round(p.minuti),
      };
    }
    if (migliore !== null) fuori.push(migliore);
  }
  fuori.sort((a, b) => b.frequenza - a.frequenza || b.valore - a.valore);
  return fuori.slice(0, QUANTI);
}

async function leggi(
  leagueId: number,
  seasonId: number | null,
  ammessi: ReadonlyMap<number, { nome: string; squadra: string }>,
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
        minuti: 0, gare: 0, contrasti: 0, falli: 0, tiri: 0, xg: 0, nome: chi.nome, squadra: chi.squadra,
      };
      p.minuti += Number(r.minutes_played) || 0;
      p.gare += 1;
      p.contrasti += Number(r.total_tackle) || 0;
      p.falli += Number(r.fouls) || 0;
      p.tiri += Number(r.total_shots) || 0;
      // xG e' nullo esattamente quando i tiri sono zero: li' vale zero, mai mancante.
      p.xg += Number(r.expected_goals) || 0;
      passi.set(pid, p);
    }
  }
  if (passi.size === 0) return null;

  const utilizzabile = (chiave: string) => chiave !== "falli_per90" || voce.falli_utilizzabili;
  return {
    cartellini: candidati(passi, voce.giallo, [
      ["contrasti", "contrasti_per90", "contrasti"],
      ["falli", "falli_per90", "falli"],
    ], utilizzabile),
    marcatori: candidati(passi, voce.gol, [
      ["tiri", "tiri_per90", "tiri"],
      ["xg", "xg_per90", "gol attesi"],
    ], utilizzabile),
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
  rosa: readonly { readonly id: number; readonly nome: string; readonly squadra: string }[],
): Promise<LetturaGiocatori | null> {
  if (rosa.length === 0) return null;
  const ammessi = new Map(rosa.map((g) => [g.id, { nome: g.nome, squadra: g.squadra }]));
  const chiave = `giocatori-lettura:${matchId}:${leagueId}:${seasonId ?? "x"}`;
  return unstable_cache(() => leggi(leagueId, seasonId, ammessi), [chiave], {
    revalidate: CACHE_TTL_SECONDS,
    tags: [`giocatori-lettura-${matchId}`],
  })();
}

/** Se un campionato ha una tabella di base misurata. Fuori da qui la sezione non esiste. */
export function haTabellaDiBase(leagueId: number): boolean {
  return Object.hasOwn(LEGHE, String(leagueId));
}
