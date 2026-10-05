// Le voci dei mercati dei gol, ognuna con la sua probabilita', il suo prezzo e il suo valore.
//
// **Un posto solo, perche' le leggono in due.** Stavano dentro la sezione Gol del dossier;
// dal 5 ottobre 2026 le chiede anche l'assistente della gara, e due copie della regola che
// sceglie il prezzo avrebbero finito per dare due valori diversi allo stesso esito.
import type { GolDiGara } from "./expected-famiglie.ts";
import type { MatchOdds } from "./odds.ts";
import type { Intervallo, MercatiGol } from "./projection/gol.ts";
import { valoreInGruppo } from "./projection/valore.ts";

export interface Voce {
  readonly etichetta: string;
  readonly probabilita: number;
  /** La quota dell'esito, dove una delle due fonti la apre. */
  readonly quota?: number | null;
  readonly valore?: number | null;
}

export type QuoteFastbet = NonNullable<GolDiGara["quote"]>;

/**
 * Il prezzo di un esito e il suo valore, da **una** fonte sola per gruppo.
 *
 * Prima la quota di consenso; dove il consenso non ha quell'esito, Fastbet. Il gruppo con
 * cui si toglie il margine viene dalla stessa fonte del prezzo: mescolare due banchi nella
 * stessa somma darebbe una probabilità che non è di nessuno dei due.
 */
function conPrezzo(
  etichetta: string,
  probabilita: number,
  consenso: { readonly quota: number | null; readonly gruppo: readonly (number | null)[] },
  fastbet: { readonly quota: number | null; readonly gruppo: readonly (number | null)[] },
  daFastbet: Set<string>,
  mercato: string,
  copertura = 1,
): Voce {
  const fonte = consenso.quota !== null ? consenso : fastbet;
  if (fonte === fastbet && fastbet.quota !== null) daFastbet.add(mercato);
  return {
    etichetta,
    probabilita,
    quota: fonte.quota,
    valore: valoreInGruppo(probabilita, fonte.quota, fonte.gruppo, copertura),
  };
}

/**
 * I multigol: la quota di consenso non li copre, quindi il prezzo è di Fastbet. Un
 * intervallo non ha un lato opposto, e il valore si legge sulla quota grezza, prudente.
 */
function daIntervalli(
  intervalli: readonly Intervallo[],
  quotati: QuoteFastbet["multigolPartita"] | undefined,
  daFastbet: Set<string>,
): Voce[] {
  return intervalli.map((i) => {
    const quota = quotati?.find((q) => q.da === i.da && q.a === i.a)?.quota ?? null;
    if (quota !== null) daFastbet.add("multigol");
    return {
      etichetta: `${i.da}-${i.a}`,
      probabilita: i.probabilita,
      quota,
      valore: valoreInGruppo(i.probabilita, quota, [quota]),
    };
  });
}

export interface VociDeiGol {
  readonly esito: readonly Voce[];
  readonly over: readonly Voce[];
  readonly entrambe: readonly Voce[];
  readonly doppia: readonly Voce[];
  readonly drawNoBet: readonly Voce[];
  readonly multiPartita: readonly Voce[];
  readonly multiCasa: readonly Voce[];
  readonly multiTrasferta: readonly Voce[];
  /** I mercati il cui prezzo viene da Fastbet e non dal consenso. */
  readonly daFastbet: ReadonlySet<string>;
}

/**
 * @param odds    la quota di consenso della gara, `null` dove la fonte non ne ha
 * @param fastbet i prezzi di Fastbet sui gol, per quello che il consenso non copre
 */
export function vociDeiGol(
  m: MercatiGol,
  odds: MatchOdds | null,
  fastbet: QuoteFastbet | null,
): VociDeiGol {
  const daFastbet = new Set<string>();
  const consenso = (mercato: string, chiavi: readonly string[], chiave: string) => {
    const esiti = odds?.markets[mercato];
    const quota = (k: string) => esiti?.find((o) => o.key === k)?.consensusOdds ?? null;
    return { quota: quota(chiave), gruppo: chiavi.map(quota) };
  };
  const banco = (quote: readonly (number | null)[], i: number) => ({ quota: quote[i], gruppo: quote });

  const esitoFb = [fastbet?.esito?.uno ?? null, fastbet?.esito?.x ?? null, fastbet?.esito?.due ?? null];
  const esito: Voce[] = ([["1", m.esito.uno, "HOME"], ["X", m.esito.x, "DRAW"], ["2", m.esito.due, "AWAY"]] as const)
    .map(([etichetta, p, chiave], i) => conPrezzo(
      etichetta, p, consenso("1x2", ["HOME", "DRAW", "AWAY"], chiave), banco(esitoFb, i), daFastbet, "esito",
    ));

  const over: Voce[] = m.overUnder.map((linea) => {
    const soglia = String(linea.linea);
    const fb = (verso: string) =>
      fastbet?.overUnder.find((q) => q.soglia === linea.linea && q.verso === verso)?.quota ?? null;
    return conPrezzo(
      `Over ${soglia.replace(".", ",")}`, linea.sopra,
      consenso(`over_under_${soglia.replace(".", "")}`, [`over@${soglia}`, `under@${soglia}`], `over@${soglia}`),
      banco([fb("Over"), fb("Under")], 0), daFastbet, "gol totali",
    );
  });

  const ggFb = [fastbet?.gol ?? null, fastbet?.noGol ?? null];
  const entrambe: Voce[] = [
    conPrezzo("Sì", m.gg, consenso("btts", ["yes", "no"], "yes"), banco(ggFb, 0), daFastbet, "gol/nogol"),
    conPrezzo("No", m.ng, consenso("btts", ["yes", "no"], "no"), banco(ggFb, 1), daFastbet, "gol/nogol"),
  ];

  // Ogni risultato cade in due doppie chance su tre: le probabilità sommano a due, e il
  // margine si toglie riportando a due la somma delle inverse.
  const dcFb = [fastbet?.doppiaChance?.unoX ?? null, fastbet?.doppiaChance?.xDue ?? null, fastbet?.doppiaChance?.unoDue ?? null];
  const doppia: Voce[] = ([["1X", m.doppiaChance.unoX], ["X2", m.doppiaChance.xDue], ["12", m.doppiaChance.unoDue]] as const)
    .map(([etichetta, p], i) => conPrezzo(
      etichetta, p, consenso("double_chance", ["1X", "X2", "12"], etichetta), banco(dcFb, i), daFastbet,
      "doppia chance", 2,
    ));

  // Draw no bet: il pareggio restituisce la posta, quindi resta 1 contro 2 riportato a uno.
  // Il consenso non lo apre: il prezzo e' solo di Fastbet.
  const dnbFb = [fastbet?.drawNoBet?.uno ?? null, fastbet?.drawNoBet?.due ?? null];
  const senzaPari = m.esito.uno + m.esito.due;
  const drawNoBet: Voce[] = senzaPari <= 0 ? [] : ([["1", m.esito.uno], ["2", m.esito.due]] as const)
    .map(([etichetta, p], i) => conPrezzo(
      etichetta, p / senzaPari, { quota: null, gruppo: [] }, banco(dnbFb, i), daFastbet, "draw no bet",
    ));

  return {
    esito, over, entrambe, doppia, drawNoBet,
    multiPartita: daIntervalli(m.multigolPartita, fastbet?.multigolPartita, daFastbet),
    multiCasa: daIntervalli(m.casa.multigol, fastbet?.multigolCasa, daFastbet),
    multiTrasferta: daIntervalli(m.trasferta.multigol, fastbet?.multigolTrasferta, daFastbet),
    daFastbet,
  };
}
