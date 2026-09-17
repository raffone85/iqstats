/**
 * Il gancio di risoluzione vero e proprio: vedi `risolutore-ts.mjs`.
 *
 * Interviene soltanto sui percorsi relativi senza estensione, e soltanto quando il file
 * con estensione `.ts` esiste davvero. Tutto il resto passa al risolutore di Node.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function resolve(specificatore, contesto, successivo) {
  // `next/cache` non ha una mappa di esportazioni: Next lo risolve, Node vuole il `.js`.
  // Serve da quando `lettura.ts` mette in cache le letture (17 settembre 2026); fuori da
  // Next `inCache` legge e basta.
  if (specificatore === "next/cache") return successivo("next/cache.js", contesto);
  const relativo = specificatore.startsWith("./") || specificatore.startsWith("../");
  const conEstensione = /\.[cm]?[jt]sx?$/u.test(specificatore) || /\.json$/u.test(specificatore);
  if (relativo && !conEstensione && contesto.parentURL !== undefined) {
    for (const coda of [".ts", "/index.ts"]) {
      const candidato = new URL(specificatore + coda, contesto.parentURL);
      if (existsSync(fileURLToPath(candidato))) {
        return successivo(specificatore + coda, contesto);
      }
    }
  }
  return successivo(specificatore, contesto);
}
