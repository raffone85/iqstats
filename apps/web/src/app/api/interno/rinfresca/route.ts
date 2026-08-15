// Rotta di servizio: tiene calda la cache delle formazioni anche quando non c'è nessuno
// collegato. La chiama un lavoro pianificato ogni dieci minuti; non è pensata per il
// pubblico e non compare in nessuna pagina.
//
// Perché esiste: la rivalidazione di Next si innesca solo quando arriva una visita. Senza
// una sveglia, chi apre il sito dopo ore di silenzio troverebbe l'ultima lettura vecchia
// quanto l'ultima visita.
import { timingSafeEqual } from "node:crypto";

import { getMatchLineups } from "@/server/iqstats/lineups";
import { getMatchesByDate } from "@/server/iqstats/matches";
import { romeDayOf } from "@/server/iqstats/rome-day";

export const dynamic = "force-dynamic";

/** Quanto avanti guardare: le formazioni ufficiali escono attorno all'ora prima. */
const WINDOW_AHEAD_MS = 2 * 60 * 60 * 1000;
/** Anche un po' indietro: una gara appena cominciata ha l'undici ufficiale da poco. */
const WINDOW_BEHIND_MS = 30 * 60 * 1000;
/** Freno di sicurezza: oltre questo numero la sveglia si ferma e lo dichiara. */
const MAX_MATCHES = 60;
/** Il tetto della fonte è dieci richieste al secondo: si va a gruppi, con una pausa. */
const BATCH_SIZE = 5;
const BATCH_PAUSE_MS = 250;

const FINISHED = new Set(["finished", "postponed", "cancelled"]);

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request): Promise<Response> {
  const expected = (process.env.IQSTATS_REFRESH_SECRET ?? "").trim();
  if (!expected) {
    // Senza segreto configurato la rotta resta chiusa: meglio muta che aperta.
    return Response.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secretMatches(provided, expected)) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const from = now - WINDOW_BEHIND_MS;
  const to = now + WINDOW_AHEAD_MS;

  // La finestra può scavalcare la mezzanotte italiana: in quel caso serve anche il giorno
  // dopo, altrimenti le gare della notte non verrebbero mai rinfrescate.
  const days = new Set<string>();
  for (const moment of [now, to]) {
    const day = romeDayOf(new Date(moment).toISOString());
    if (day !== null) days.add(day);
  }

  const upcoming: number[] = [];
  for (const day of days) {
    const result = await getMatchesByDate(day);
    for (const match of result.matches) {
      if (FINISHED.has(match.status)) continue;
      const kickoff = new Date(match.kickoff).getTime();
      if (Number.isNaN(kickoff) || kickoff < from || kickoff > to) continue;
      upcoming.push(match.eventId);
    }
  }

  const selected = upcoming.slice(0, MAX_MATCHES);
  let refreshed = 0;
  let confirmed = 0;

  for (let index = 0; index < selected.length; index += BATCH_SIZE) {
    const batch = selected.slice(index, index + BATCH_SIZE);
    // Non serve invalidare a mano: la voce vale cinque minuti e la sveglia passa ogni
    // dieci, quindi è già scaduta e questa lettura la riempie di nuovo.
    const results = await Promise.all(batch.map((eventId) => getMatchLineups(eventId)));
    for (const lineups of results) {
      if (lineups === null) continue;
      refreshed += 1;
      if (lineups.confirmed) confirmed += 1;
    }
    if (index + BATCH_SIZE < selected.length) await sleep(BATCH_PAUSE_MS);
  }

  return Response.json({
    ok: true,
    inWindow: upcoming.length,
    attempted: selected.length,
    refreshed,
    confirmed,
    truncated: upcoming.length > selected.length,
  });
}
