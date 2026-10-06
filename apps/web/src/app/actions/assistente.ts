"use server";

import type { Risposta } from "@/server/iqstats/assistente";
import { rispostaDellaGara } from "@/server/iqstats/assistente-gara-dati";

/**
 * Una domanda all'assistente della gara, dalla casella «Chiedi» del dossier.
 *
 * **Un'azione e non una rotta.** Le rotte API di IQstatS chiedono account e diritto, perche'
 * arrivano da internet; questa risponde solo a chi ha la pagina davanti, e Next ne controlla
 * l'origine da solo. Restituisce cio' che il dossier mostrerebbe per la stessa domanda
 * nell'indirizzo, con lo stesso controllo sul piano dentro `rispostaDellaGara`.
 *
 * Gli argomenti arrivano dal browser e non sono fidati: si controllano prima di usarli.
 */
export async function chiediAllaGara(gara: unknown, domanda: unknown): Promise<Risposta | null> {
  if (typeof gara !== "number" || !Number.isInteger(gara) || gara <= 0) return null;
  if (typeof domanda !== "string") return null;
  return rispostaDellaGara(gara, domanda);
}
