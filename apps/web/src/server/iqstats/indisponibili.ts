// Chi non c'e' in una gara, letto in italiano.
//
// Sta in un modulo suo e non dentro `lineups.ts` per una ragione pratica: quel file
// importa la cache di Next, e con quell'import la regola di traduzione non si potrebbe
// provare senza montare l'applicazione. Qui non c'e' nessuna dipendenza, e le prove
// girano da sole.

/** Chi non c'e', e perche'. Il motivo si traduce: la pagina non parla la lingua della fonte. */
export interface Indisponibile {
  readonly nome: string;
  readonly stato: "infortunato" | "squalificato" | "altro";
  /** Gia' in italiano, o `null` quando la fonte non dice niente di leggibile. */
  readonly motivo: string | null;
}

/**
 * Il vocabolario dei motivi.
 *
 * **Misurato su trenta gare** dei prossimi tre giorni: 83 indisponibili per `injured` e 5
 * per `suspended`, e i motivi arrivano in inglese - «Knee Injury», «Hamstring Injury» - o
 * in forma tecnica - «yellow_or_red_card_suspension». La pagina non ripete l'etichetta
 * della fonte: quello che non e' in questa tavola non si mostra, e resta lo stato.
 */
const PARTI: ReadonlyArray<readonly [string, string]> = [
  ["cruciate ligament", "legamento crociato"],
  ["achilles tendon", "tendine d'Achille"],
  ["hamstring", "flessori"],
  ["meniscus", "menisco"],
  ["shoulder", "spalla"],
  ["ankle", "caviglia"],
  ["muscle", "muscolare"],
  ["thigh", "coscia"],
  ["groin", "inguine"],
  ["knee", "ginocchio"],
  ["calf", "polpaccio"],
  ["foot", "piede"],
  ["back", "schiena"],
  ["head", "testa"],
  ["hip", "anca"],
  ["leg", "gamba"],
  ["knock", "contusione"],
  ["illness", "malattia"],
];

/** Come si legge un'indisponibilita', in italiano e senza inventare quello che non c'e'. */
export function motivoInItaliano(
  stato: string | null,
  motivo: string | null,
): { stato: Indisponibile["stato"]; motivo: string | null } {
  const grezzo = (motivo ?? "").toLowerCase();
  if (stato === "suspended") {
    return {
      stato: "squalificato",
      // `yellow_or_red_card_suspension` contiene «red_card» ma e' la somma dei gialli:
      // chiamarla espulsione sarebbe una notizia diversa da quella che la fonte manda.
      motivo: grezzo.includes("red_card") && !grezzo.includes("yellow") ? "espulsione" : null,
    };
  }
  if (stato === "injured") {
    if (grezzo.includes("surgery")) return { stato: "infortunato", motivo: "operato" };
    if (grezzo.startsWith("broken")) return { stato: "infortunato", motivo: "frattura" };
    const parte = PARTI.find(([inglese]) => grezzo.includes(inglese));
    return {
      stato: "infortunato",
      motivo: parte === undefined ? null : parte[1],
    };
  }
  return { stato: "altro", motivo: grezzo.includes("transfer") ? "in uscita" : null };
}
