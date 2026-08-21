import cornerKicks from "./artefatti/corner_kicks__poisson_glm.json" with { type: "json" };
import fouls from "./artefatti/fouls__ridge.json" with { type: "json" };
import goalkeeperSaves from "./artefatti/goalkeeper_saves__poisson_glm.json" with { type: "json" };
import offsides from "./artefatti/offsides__poisson_glm.json" with { type: "json" };
import shotsOnTarget from "./artefatti/shots_on_target__poisson_glm.json" with { type: "json" };
import totalShots from "./artefatti/total_shots__ridge.json" with { type: "json" };
import yellowCards from "./artefatti/yellow_cards__poisson_glm.json" with { type: "json" };

import { leggiArtefatto, type ArtefattoModello } from "./projection/artifact-schema.ts";

/**
 * Gli artefatti che l'applicazione legge davvero: i sette promossi a `production`.
 *
 * **Perche' importati e non letti dal disco.** Un `readFileSync` in un ambiente senza
 * filesystem prevedibile e' una scommessa; un import statico entra nel pacchetto e o
 * compila o fallisce il build. Lo stesso schema del motore statistico esistente, che
 * importa `data/ratings-state.generated.json`.
 *
 * **Perche' sette e non quattordici.** `production` non se lo assegna il registro: e' una
 * scelta umana fra i validati, presa il 21 agosto 2026 sui modelli con il MAE migliore
 * fuori campione — che sono, su tutti e sette i bersagli, gli stessi che portano la misura
 * completa della gara. Gli altri sette restano `validated` e non si mostrano.
 *
 * **Perche' la verifica al caricamento.** `leggiArtefatto` rifiuta un artefatto malformato
 * qui, quando il modulo si carica, e non davanti a una gara. L'impronta dei byte non si
 * puo' controllare su un modulo importato: la controlla il test, che legge i file dal
 * disco e li confronta con quelli generati.
 */

const PROMOSSI: readonly unknown[] = [
  totalShots, shotsOnTarget, cornerKicks, fouls, yellowCards, offsides, goalkeeperSaves,
];

function leggiPromossi(): ReadonlyMap<string, ArtefattoModello> {
  const mappa = new Map<string, ArtefattoModello>();
  PROMOSSI.forEach((grezzo) => {
    const artefatto = leggiArtefatto(grezzo);
    if (artefatto.stato !== "production") {
      throw new Error(
        "artefatto " + artefatto.model_id + " non e' production: "
        + "l'applicazione mostra solo cio' che una persona ha promosso",
      );
    }
    if (mappa.has(artefatto.target)) {
      throw new Error("due artefatti per il bersaglio " + artefatto.target);
    }
    mappa.set(artefatto.target, artefatto);
  });
  return mappa;
}

/** Bersaglio → artefatto promosso. L'ordine e' quello di lettura in pagina. */
export const ARTEFATTI_DI_PRODUZIONE: ReadonlyMap<string, ArtefattoModello> = leggiPromossi();
