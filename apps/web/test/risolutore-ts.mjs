/**
 * Risolutore per i test che caricano i moduli del motore di proiezione.
 *
 * Quei moduli sono arrivati dal lato che ricerca senza una riga di modifica, e li'
 * gli import interni non portano l'estensione: `tsc` con `moduleResolution: node` la
 * aggiunge, il caricatore ESM di Node no. Cambiare gli import romperebbe il build che
 * li compila — con `module: commonjs` un percorso che finisce in `.ts` non e' ammesso —
 * quindi la differenza si assorbe qui, nel lato che prova, e non nel motore.
 *
 * Uso: node --import ./test/risolutore-ts.mjs --experimental-strip-types --test ...
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./risolutore-ts-hook.mjs", import.meta.url), pathToFileURL("./"));
