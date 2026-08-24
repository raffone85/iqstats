/**
 * La prossima giornata di ogni competizione, dalle gare gia' lette.
 *
 * **Perche' la giornata e non il giorno.** Un campionato gioca la sua giornata su tre o
 * quattro giorni: chi apre l'app non si chiede «che si gioca oggi», si chiede «quando gioca
 * la mia squadra». Il calendario per giorno resta in `/partite`, che risponde all'altra
 * domanda.
 *
 * **Le coppe non hanno una giornata.** La fonte le numera con turni che non sono giornate -
 * la Champions dichiara `round_number` 636 - quindi per loro si prende la finestra di
 * giorni e si dice che e' una finestra, non un turno.
 *
 * Funzione pura: le gare arrivano gia' lette, qui si raggruppa soltanto.
 */
import type { MatchListItem } from "./matches.ts";

/** Oltre questo numero il turno non e' una giornata di campionato: e' la numerazione di una coppa. */
const TURNO_MASSIMO = 60;

export interface GiornataDiCompetizione {
  readonly leagueId: number;
  readonly leagueName: string;
  readonly leagueCountryCode: string | null;
  /** Il numero di giornata, `null` per le coppe e per chi non lo dichiara. */
  readonly giornata: number | null;
  readonly gare: readonly MatchListItem[];
  /**
   * Le altre gare della finestra che appartengono a turni diversi: i recuperi.
   *
   * Non si mostrano qui - non sono la prossima giornata - ma non si nascondono: si dice
   * quante sono, e si manda al calendario dove ci sono.
   */
  readonly recuperi: number;
}

/** Una gara e' ancora da vedere finche' non e' conclusa, rinviata o annullata. */
function daVedere(m: MatchListItem): boolean {
  return m.status !== "finished" && m.status !== "postponed" && m.status !== "cancelled";
}

/**
 * Le prossime giornate, una per competizione, ordinate per il primo calcio d'inizio.
 *
 * **La giornata e' il turno con piu' gare in arrivo, non il piu' basso.** Misurato il 24
 * agosto sulla fonte: la Premier ha una gara di turno 1 e dieci di turno 2, la Serie A una
 * di turno 1 e dieci di turno 2, la Liga quattro di turno 1, una di turno 2 e dieci di
 * turno 3. Quelle da una gara sono recuperi: prendendo il turno piu' basso il menu avrebbe
 * mostrato «giornata 1, una gara» e nascosto la giornata vera.
 *
 * A parita' di gare vince il turno piu' basso, che e' quello che si gioca prima.
 *
 * Se il turno non e' dichiarato, o e' una numerazione da coppa, si tengono tutte le gare
 * della finestra e `giornata` resta `null`: la pagina non scrive un numero che non
 * significa una giornata.
 */
export function prossimeGiornate(
  gare: readonly MatchListItem[],
): readonly GiornataDiCompetizione[] {
  const perLega = new Map<number, MatchListItem[]>();
  for (const m of gare) {
    if (m.leagueId === null || !daVedere(m)) continue;
    const elenco = perLega.get(m.leagueId);
    if (elenco === undefined) perLega.set(m.leagueId, [m]);
    else elenco.push(m);
  }

  const fuori: GiornataDiCompetizione[] = [];
  for (const [leagueId, elenco] of perLega) {
    const conteggio = new Map<number, number>();
    for (const m of elenco) {
      const t = m.roundNumber;
      if (t === null || t <= 0 || t > TURNO_MASSIMO) continue;
      conteggio.set(t, (conteggio.get(t) ?? 0) + 1);
    }

    let giornata: number | null = null;
    for (const [turno, quante] of conteggio) {
      if (giornata === null) { giornata = turno; continue; }
      const miglior = conteggio.get(giornata) ?? 0;
      if (quante > miglior || (quante === miglior && turno < giornata)) giornata = turno;
    }

    const scelte = (giornata === null ? elenco : elenco.filter((m) => m.roundNumber === giornata))
      .slice()
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    if (scelte.length === 0) continue;

    fuori.push({
      leagueId,
      leagueName: scelte[0].leagueName ?? `Competizione ${leagueId}`,
      leagueCountryCode: scelte[0].leagueCountryCode,
      giornata,
      gare: scelte,
      recuperi: elenco.length - scelte.length,
    });
  }

  return fuori.sort((a, b) => a.gare[0].kickoff.localeCompare(b.gare[0].kickoff));
}
