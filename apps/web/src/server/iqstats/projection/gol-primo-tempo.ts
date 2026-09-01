import { mercatiGol, type MercatiGol } from "./gol.ts";

/**
 * Quota dei gol che si colloca nel primo tempo.
 * Le osservazioni non portano xG per tempo: 0,44 e' la quota europea tipica,
 * dichiarata in pagina, non misurata su questa gara.
 */
export const QUOTA_PRIMO_TEMPO = 0.44;

export function mercatiPrimoTempo(
  attesiCasa: number,
  attesiTrasferta: number,
  quota = QUOTA_PRIMO_TEMPO,
): MercatiGol {
  return mercatiGol(attesiCasa * quota, attesiTrasferta * quota);
}
