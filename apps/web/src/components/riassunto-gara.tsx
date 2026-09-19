// Il riassunto pre-gara in prosa: la logica sta in `@/server/iqstats/riassunto-gara`.
import { chiDelConsiglio, consiglio } from "@/components/expected-voce";
import type { GaraExpected } from "@/server/iqstats/expected-famiglie";
import { frasiDellaGara } from "@/server/iqstats/riassunto-gara";

/** Il riassunto in prosa; `breve` tiene solo le prime due frasi. */
export function RiassuntoGara({ g, breve = false }: { readonly g: GaraExpected; readonly breve?: boolean }) {
  const c = g.consigliato;
  const frasi = frasiDellaGara(g, c === null ? null : `${consiglio(c)} (${chiDelConsiglio(c, g.casa, g.fuori)})`);
  if (frasi.length === 0) return null;
  return <p className="riassunto-gara">{(breve ? frasi.slice(0, 2) : frasi).join(" ")}</p>;
}
