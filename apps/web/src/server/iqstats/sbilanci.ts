// Server-only: dove il modello si stacca di piu' dalla media, fra le gare di un giorno.
//
// **Perche' non si ordina per percentuale.** «Casa al 54%» e «Trasferta al 45%» sembrano
// dire che la prima e' piu' decisa. Non e' vero: misurato sulle nostre osservazioni degli
// ultimi 365 giorni, la squadra di casa vince il 44,5% delle volte e quella in trasferta il
// 29,0%. Quindi 54% in casa e' +9,5 sopra la media, mentre 45% in trasferta e' +16,0: la
// seconda lettura e' quasi il doppio piu' decisa, con la percentuale piu' bassa. Ordinare
// per percentuale metterebbe in cima l'esito piu' comune, non quello su cui il modello sta
// dicendo qualcosa.
//
// **La media non e' decisa a tavolino**: si legge dalle stesse righe che il motore usa per
// proiettare, e si muove con loro. Stessa disciplina del metro di lega degli arbitri.
//
// **Quello che qui NON c'e', ed e' dichiarato in pagina.** Il motore di proiezione misura
// quanto un bersaglio ci prende fuori campione, e `letture-forti` ordina per
// `decisione x affidabilita`. I pronostici della fonte quella misura non ce l'hanno:
// misurato su 200 righe, il campo `confidence` e' **esattamente** la probabilita' del
// favorito, zero righe diverse, scarto massimo 0,05 punti. Un nome diverso per lo stesso
// numero non e' una seconda misura, e usarlo come affidabilita' vorrebbe dire ordinare per
// percentuale credendo di fare altro.
import "server-only";

import { connessione } from "./lettura.ts";
import type { DashboardPrediction } from "./predictions.ts";

/** Le medie si muovono di poco: una lettura al giorno basta. */
const TTL_MS = 6 * 60 * 60 * 1000;

/** La stessa finestra scelta dall'utente per le statistiche descrittive. */
const GIORNI = 365;

export interface MedieDiMercato {
  /** Su quante gare complete poggiano queste medie. */
  readonly gare: number;
  readonly casa: number;
  readonly pari: number;
  readonly trasferta: number;
  readonly over25: number;
  readonly gg: number;
}

export interface Sbilancio {
  readonly eventId: number;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly leagueName: string | null;
  readonly kickoff: string;
  /** Il nome del mercato, come si legge in pagina. */
  readonly mercato: string;
  /** La probabilita' che il modello assegna, da 0 a 100. */
  readonly probabilita: number;
  /** Quanto quell'esito succede davvero, da 0 a 100. */
  readonly media: number;
  /** `probabilita - media`: e' il numero su cui si ordina, in punti percentuali. */
  readonly scarto: number;
}

let cache: { valore: MedieDiMercato | null; scade: number } | undefined;

/**
 * Quanto succedono davvero i cinque esiti, sulle nostre osservazioni.
 *
 * `having count(*) = 2` tiene il conto onesto: una gara entra solo con entrambe le righe,
 * altrimenti il risultato sarebbe meta' gara. `null` senza connessione: la sezione non
 * compare e la pagina lo dichiara, invece di inventare una media.
 */
export async function medieDiMercato(): Promise<MedieDiMercato | null> {
  const adesso = Date.now();
  if (cache && cache.scade > adesso) return cache.valore;

  const sql = connessione();
  if (sql === null) return null;

  try {
    const righe = await sql<Array<{
      gare: string; casa: string; pari: string; trasferta: string; over25: string; gg: string;
    }>>`
      with gara as (
        select match_id,
               max(goals_for) filter (where side = 'home') as gc,
               max(goals_for) filter (where side = 'away') as gt
        from football.team_match_observations
        where goals_for is not null
          and kickoff_at >= now() - ${`${GIORNI} days`}::interval
        group by 1
        having count(*) = 2
      )
      select count(*)::text as gare,
             (100.0 * avg((gc > gt)::int))::text as casa,
             (100.0 * avg((gc = gt)::int))::text as pari,
             (100.0 * avg((gc < gt)::int))::text as trasferta,
             (100.0 * avg((gc + gt > 2)::int))::text as over25,
             (100.0 * avg((gc > 0 and gt > 0)::int))::text as gg
      from gara
    `;
    const riga = righe[0];
    // Sotto un campione serio una «media» e' un aneddoto: meglio nessuna sezione.
    const valore = riga === undefined || Number(riga.gare) < 500 ? null : {
      gare: Number(riga.gare),
      casa: Number(riga.casa),
      pari: Number(riga.pari),
      trasferta: Number(riga.trasferta),
      over25: Number(riga.over25),
      gg: Number(riga.gg),
    };
    cache = { valore, scade: adesso + TTL_MS };
    return valore;
  } catch {
    return null;
  }
}

/**
 * Le letture piu' staccate dalla media, una per gara, dalla piu' staccata in giu'.
 *
 * Una gara compare **una volta sola**, con il suo mercato piu' staccato: due mercati della
 * stessa gara non sono due informazioni, sono la stessa gara detta due volte. E' la stessa
 * regola che `letture-forti` applica alle famiglie dentro il dossier.
 *
 * Nessuna soglia: si mostrano le prime `quante` e **si scrive lo scarto accanto a ognuna**.
 * Se il giorno non ha niente da dire, la prima riga porta un numero piccolo e si vede.
 */
export function sbilanciDelGiorno(
  pronostici: readonly DashboardPrediction[],
  medie: MedieDiMercato,
  quante: number,
): readonly Sbilancio[] {
  const sbilanci: Sbilancio[] = [];

  for (const p of pronostici) {
    // Una gara rinviata o annullata non e' una lettura da mettere in cima: stesso perimetro
    // che la home usa gia' per scegliere la gara in evidenza.
    if (p.status === "finished" || p.status === "postponed" || p.status === "cancelled") continue;
    const candidati: Array<{ mercato: string; probabilita: number | null; media: number }> = [
      { mercato: "Casa", probabilita: p.probHome, media: medie.casa },
      { mercato: "Pareggio", probabilita: p.probDraw, media: medie.pari },
      { mercato: "Trasferta", probabilita: p.probAway, media: medie.trasferta },
      { mercato: "Over 2,5", probabilita: p.probOver25, media: medie.over25 },
      { mercato: "Gol/Gol", probabilita: p.probBtts, media: medie.gg },
    ];

    let migliore: Sbilancio | null = null;
    for (const c of candidati) {
      if (c.probabilita === null) continue;
      // Solo verso l'alto: «Casa al 20%» e' informativo, ma dirlo come «Casa» accesa
      // sarebbe il contrario di quello che il modello sta dicendo, e il complemento di un
      // esito a tre non e' un esito.
      const scarto = c.probabilita - c.media;
      if (scarto <= 0) continue;
      if (migliore !== null && scarto <= migliore.scarto) continue;
      migliore = {
        eventId: p.eventId,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        leagueName: p.leagueName,
        kickoff: p.kickoff,
        mercato: c.mercato,
        probabilita: c.probabilita,
        media: c.media,
        scarto,
      };
    }
    if (migliore !== null) sbilanci.push(migliore);
  }

  return sbilanci.sort((a, b) => b.scarto - a.scarto).slice(0, quante);
}
