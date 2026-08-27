// Server-only: chi allena una squadra adesso, e da dove lo sappiamo.
//
// **Serve a due pagine che avevano due comportamenti diversi.** Il dossier prendeva
// l'allenatore dall'evento della fonte e, quando l'evento non lo dichiarava, restava senza;
// `/expected` non lo cercava affatto e passava `null` al motore, spegnendo le sei feature
// `allenatore_*` su gialli, fuorigioco, parate e corner. La regola vive qui, una sola, e le
// due pagine la chiamano.
//
// **La priorita' e' misurata, non scelta.** Il 27 agosto 2026, su 60 squadre a caso:
// l'allenatore della prossima gara in calendario e quello della nostra ultima gara
// osservata coincidono in 47 casi, la fonte corregge il nostro in 2, e in 11 la fonte non
// dice niente (nessuna gara futura, oppure gara senza allenatore). Le due correzioni sono
// entrambe su squadre la cui ultima gara osservata era vecchia di 117 e 263 giorni: la
// fonte vince dove il nostro dato e' invecchiato, quindi la fonte va per prima e il nostro
// livello dati resta il ripiego.
import "server-only";

import { connessione } from "./lettura.ts";
import { getManager, getTeamNextCoachId, type ManagerInfo } from "./match-context.ts";

/**
 * Oltre questa distanza l'ultima gara osservata non nomina piu' l'allenatore di oggi.
 *
 * **Non e' una soglia decisa a tavolino.** Misurata il 27 agosto 2026 sulle 21.342
 * osservazioni del livello dati, confrontando l'allenatore fra due gare consecutive della
 * stessa squadra in funzione della distanza fra le due: sotto i 30 giorni cambia lo **0,3%**
 * (19.515 passaggi), fra 30 e 45 il **4,5%** (67), fra 45 e 60 il **10,7%** (122), fra 60 e
 * 75 il **20,5%** (117), oltre i 75 il **29,8%** (305). Il gomito della curva sta qui.
 *
 * Oltre i 180 giorni la nostra storia non ha nemmeno un passaggio chiuso: quel rischio non
 * e' misurato, si sa solo che non e' minore del 29,8%.
 */
export const GIORNI_MASSIMI = 45;

/** Da dove viene l'identificativo dell'allenatore che si sta usando. */
export type FonteAllenatore = "evento" | "prossima-gara" | "ultima-osservata";

/**
 * L'allenatore di una squadra con la sua provenienza.
 *
 * `scaduto` non e' `assente`: la squadra un allenatore osservato ce l'ha, ma e' troppo
 * vecchio per nominare quello di oggi. La pagina deve poterlo dire, invece di tacere.
 */
export type AllenatoreDellaSquadra =
  | {
    readonly esito: "trovato";
    readonly id: number;
    /** `null` quando la fonte non espone il profilo: l'identificativo resta valido. */
    readonly profilo: ManagerInfo | null;
    readonly fonte: FonteAllenatore;
    /** Data della gara osservata da cui viene l'identificativo: solo per `ultima-osservata`. */
    readonly osservatoIl: string | null;
    readonly giorni: number | null;
  }
  | { readonly esito: "scaduto"; readonly osservatoIl: string; readonly giorni: number }
  | { readonly esito: "assente" };

/** L'ultima gara osservata di una squadra, con l'allenatore che l'ha guidata. */
interface UltimaOsservata {
  readonly id: number;
  readonly quando: string;
  readonly giorni: number;
}

/**
 * Le tre porte da cui l'allenatore puo' entrare.
 *
 * Sono un parametro perche' la priorita' fra loro e' la cosa da difendere con un test, e
 * un test che debba parlare con la fonte e col livello dati non verifica la priorita':
 * verifica la rete.
 */
export interface FontiAllenatore {
  readonly profilo: (managerId: number) => Promise<ManagerInfo | null>;
  readonly prossimaGara: (teamSourceId: number) => Promise<number | null>;
  readonly ultimaOsservata: (teamSourceId: number) => Promise<UltimaOsservata | null>;
}

/** L'allenatore dell'ultima gara che abbiamo osservato, senza giudicarne l'eta'. */
async function ultimaOsservataDalLivelloDati(teamSourceId: number): Promise<UltimaOsservata | null> {
  const sql = connessione();
  if (sql === null) return null;
  try {
    const righe = await sql<Array<{ coach: string; quando: string; giorni: string }>>`
      select o.coach_source_id::text as coach,
             o.kickoff_at::text as quando,
             floor(extract(epoch from now() - o.kickoff_at) / 86400)::text as giorni
      from football.teams t
      join football.team_match_observations o on o.team_id = t.id
      where t.source_id = ${teamSourceId}::bigint
        and o.coach_source_id is not null
      order by o.kickoff_at desc
      limit 1
    `;
    const riga = righe[0];
    if (riga === undefined) return null;
    const id = Number(riga.coach);
    const giorni = Number(riga.giorni);
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(giorni)) return null;
    return { id, quando: riga.quando, giorni };
  } catch {
    return null;
  }
}

const FONTI_VERE: FontiAllenatore = {
  profilo: getManager,
  prossimaGara: getTeamNextCoachId,
  ultimaOsservata: ultimaOsservataDalLivelloDati,
};

/**
 * Chi allena questa squadra, in ordine di attendibilita'.
 *
 * 1. `idDallEvento` — la gara in calendario lo dichiara: e' l'allenatore di quella gara;
 * 2. la prossima gara in calendario della squadra, secondo la fonte;
 * 3. l'ultima gara che abbiamo osservato, se non e' piu' vecchia di `GIORNI_MASSIMI`;
 * 4. niente, e si dichiara. Nessun identificativo messo al posto di un'assenza.
 */
export async function allenatoreDellaSquadra(
  teamSourceId: number | null,
  idDallEvento: number | null,
  fonti: FontiAllenatore = FONTI_VERE,
): Promise<AllenatoreDellaSquadra> {
  if (idDallEvento !== null && Number.isInteger(idDallEvento) && idDallEvento > 0) {
    return {
      esito: "trovato",
      id: idDallEvento,
      profilo: await fonti.profilo(idDallEvento),
      fonte: "evento",
      osservatoIl: null,
      giorni: null,
    };
  }

  if (teamSourceId === null || !Number.isInteger(teamSourceId) || teamSourceId <= 0) {
    return { esito: "assente" };
  }

  const dallaFonte = await fonti.prossimaGara(teamSourceId);
  if (dallaFonte !== null) {
    return {
      esito: "trovato",
      id: dallaFonte,
      profilo: await fonti.profilo(dallaFonte),
      fonte: "prossima-gara",
      osservatoIl: null,
      giorni: null,
    };
  }

  const osservata = await fonti.ultimaOsservata(teamSourceId);
  if (osservata === null) return { esito: "assente" };
  if (osservata.giorni > GIORNI_MASSIMI) {
    return { esito: "scaduto", osservatoIl: osservata.quando, giorni: osservata.giorni };
  }
  return {
    esito: "trovato",
    id: osservata.id,
    profilo: await fonti.profilo(osservata.id),
    fonte: "ultima-osservata",
    osservatoIl: osservata.quando,
    giorni: osservata.giorni,
  };
}

/** L'identificativo da passare al motore, o `null` quando non ce n'e' uno attendibile. */
export function idAllenatore(allenatore: AllenatoreDellaSquadra | null): number | null {
  return allenatore !== null && allenatore.esito === "trovato" ? allenatore.id : null;
}

const GIORNO: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome",
};

/**
 * La provenienza in chiaro, da mettere accanto al nome. Ogni evidenza porta il motivo per
 * cui e' quella: qui il motivo e' da dove viene l'identificativo, e quanto e' vecchio.
 */
export function provenienzaInChiaro(allenatore: AllenatoreDellaSquadra): string {
  if (allenatore.esito === "assente") return "allenatore non dichiarato da nessuna fonte";
  if (allenatore.esito === "scaduto") {
    return `ultima gara osservata il ${data(allenatore.osservatoIl)}, ${allenatore.giorni} giorni fa: `
      + `troppo per nominare l'allenatore di oggi, non usato`;
  }
  if (allenatore.fonte === "evento") return "dichiarato dalla fonte su questa gara";
  if (allenatore.fonte === "prossima-gara") return "dalla prossima gara in calendario";
  return `dall'ultima gara osservata il ${data(allenatore.osservatoIl)}`
    + (allenatore.giorni === null ? "" : `, ${allenatore.giorni} giorni fa`);
}

function data(quando: string | null): string {
  if (quando === null) return "data non dichiarata";
  const istante = new Date(quando);
  return Number.isNaN(istante.getTime())
    ? "data non dichiarata"
    : istante.toLocaleDateString("it-IT", GIORNO);
}
