import taratura from "../artefatti/taratura-promessa.json" with { type: "json" };

/**
 * **Il numero che la pagina mostra, non quello su cui si ordina.**
 *
 * L'insieme delle letture e' calibrato, le sue parti no: misurato il 20 settembre 2026 su
 * 2.674 letture di gare chiuse, sotto la norma del campionato il motore rende piu' di
 * quanto promette, e oltre i dieci punti di scarto promette molto piu' di quanto rende.
 * La correzione per fascia, stimata sulle gare vecchie e applicata a quelle nuove, porta
 * l'errore medio di calibrazione da 4,31 a 2,61 punti e azzera la distanza del consigliato.
 *
 * Non tocca il criterio: `probabilita`, `sorpresa` e `forza` restano quelle del motore, e
 * l'ordine delle letture non cambia. Senza base di lega non si corregge niente, perche'
 * senza norma non esiste uno scarto da cui leggere la correzione.
 */
export function promessaTarata(probabilita: number, base: number | null): number {
  if (base === null) return probabilita;
  const scarto = probabilita * 100 - base;
  const fascia = taratura.fasce.find(
    (f) => (f.da === null || scarto >= f.da) && (f.a === null || scarto < f.a),
  );
  if (fascia?.correzione == null) return probabilita;
  // Restare dentro [0, 1]: una correzione non puo' produrre una promessa impossibile.
  return Math.min(1, Math.max(0, probabilita + fascia.correzione));
}

/** Il campione e il periodo su cui la taratura e' stata stimata, per dirlo in pagina. */
export const campioneDellaTaratura = taratura.campione;
