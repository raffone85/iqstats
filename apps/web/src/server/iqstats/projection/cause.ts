/**
 * Da centoventinove contributi a due o tre cause dicibili.
 *
 * I modelli sono lineari, quindi il contributo di ogni feature al predittore e' esatto:
 * `coefficiente x valore standardizzato`. Ma centoventinove righe non sono una
 * motivazione, e tre feature della stessa famiglia elencate una per una fanno sembrare
 * tre cause quello che e' una causa sola. Qui si raggruppa, si converte e si taglia.
 *
 * **Le feature di campione escono.** `gare_precedenti`, `prodotto_stagione_campione`,
 * `arbitro_campione`, `arbitro_gare_viste` non dicono niente sul calcio di questa gara:
 * dicono quante righe abbiamo visto, cioe' misurano la nostra ignoranza. Sulla gara
 * 213568 erano il primo e il quarto contributo dei tiri in trasferta, e scritte come
 * causa avrebbero detto «il Valencia tira poco perche' ha giocato quattro partite».
 *
 * **Il raggruppamento disinnesca anche le collineari.** Sempre su 213568,
 * `arbitro_campione` valeva +1,462 e `arbitro_gare_viste` −1,261 con lo **stesso** valore
 * grezzo, 21: due colonne fra cui il ridge si e' spartito il peso. Elencate separate erano
 * le due cause piu' grandi della gara; sommate nel loro gruppo valgono quello che valgono.
 *
 * **L'effetto si converte, non si mostra grezzo.** Su `identita` il contributo e' gia'
 * nell'unita' del bersaglio, su `log` e' moltiplicativo: lo stesso numero letto con la
 * stessa unita' direbbe il falso su cinque modelli su sette. Qui esce sempre una quota
 * dell'atteso, che e' l'unica lettura che vale per entrambi i collegamenti.
 *
 * Modulo puro: nessun accesso a rete, disco o applicazione.
 */

import type { Collegamento } from './artifact-schema';
import type { ContributoDiFeature } from './predictor';
import type { EsitoDiProduzione } from './production';

/** Una causa: il nome che si legge e quanto ha spostato l'atteso, in quota. */
export interface Causa {
  readonly nome: string;
  /** Quota dell'atteso: `+0,08` vuol dire che questa causa lo alza dell'otto per cento. */
  readonly effetto: number;
}

/**
 * Le feature che contano righe invece che calcio.
 *
 * Non e' un elenco di nomi ma tre pezzi di nome, perche' i sette modelli li declinano
 * ciascuno a modo suo: `prodotto_stagione_campione`, `lega_lato_campione`,
 * `arbitro_campione` sono la stessa cosa detta tre volte.
 */
const PEZZI_DI_CAMPIONE = ['campione', 'gare_precedenti', 'gare_viste'];

/**
 * Dal nome della feature al gruppo che si legge.
 *
 * L'ordine conta: `avv_concesso_` deve vincere su `concesso_`, altrimenti quello che
 * concede l'avversario finisce fra quello che subisce la squadra, che e' l'opposto.
 */
const GRUPPI: ReadonlyArray<readonly [string, string]> = [
  ['avv_concesso_', "quanto concede l'avversario"],
  ['avv_prodotto_', "quanto produce l'avversario"],
  ['avv_giorni_di_riposo', "il riposo dell'avversario"],
  ['debolezza_difesa_avversario', "l'incrocio fra attacco e difesa"],
  ['confronto_produce_meno_concede', "l'incrocio fra attacco e difesa"],
  ['baseline_attacco_contro_concesso', "l'incrocio fra attacco e difesa"],
  ['concesso_', 'quanto subisce la squadra'],
  ['prodotto_', 'quanto produce la squadra'],
  ['baseline_', 'il livello della squadra'],
  ['interazione_casa', 'il fattore campo'],
  ['classifica_', 'la classifica'],
  ['arbitro_', "l'arbitro"],
  ['giocatori_', 'gli undici'],
  ['lega_', 'la norma del campionato'],
  ['zeta_dalla_lega', 'la norma del campionato'],
];

function gruppoDi(nome: string): string | null {
  if (PEZZI_DI_CAMPIONE.some((pezzo) => nome.includes(pezzo))) return null;
  for (const [pezzo, etichetta] of GRUPPI) {
    if (nome.startsWith(pezzo)) return etichetta;
  }
  return null;
}

/**
 * I gruppi di un lato, tutti, gia' convertiti in quota dell'atteso e senza ordine.
 *
 * Si converte **dopo** aver sommato il gruppo, non prima: su `log` l'esponenziale non e'
 * additivo, e convertire feature per feature darebbe una somma che non e' l'effetto del
 * gruppo.
 *
 * Risponde vuoto sotto un ripiego - dove `contributi` e' `null` perche' nessun modello ha
 * parlato - e dove il predittore e' troppo vicino a zero perche' una quota abbia senso.
 */
function gruppiDiLato(
  contributi: readonly ContributoDiFeature[] | null,
  predittoreLineare: number | null,
  collegamento: Collegamento,
): readonly Causa[] {
  if (contributi === null || contributi.length === 0) return [];
  const eta = predittoreLineare;
  if (collegamento === 'identita' && (eta === null || Math.abs(eta) < 1e-6)) return [];

  const somme = new Map<string, number>();
  for (const { nome, contributo } of contributi) {
    if (!Number.isFinite(contributo)) continue;
    const gruppo = gruppoDi(nome);
    if (gruppo === null) continue;
    somme.set(gruppo, (somme.get(gruppo) ?? 0) + contributo);
  }

  return [...somme].map(([nome, somma]) => ({
    nome,
    effetto: collegamento === 'log' ? Math.exp(somma) - 1 : somma / (eta as number),
  }));
}

/** Ordina per grandezza, butta il rumore sotto l'uno per cento, taglia. */
function prime(cause: readonly Causa[], quante: number): readonly Causa[] {
  return [...cause]
    .filter((causa) => Number.isFinite(causa.effetto) && Math.abs(causa.effetto) >= 0.01)
    .sort((una, altra) => Math.abs(altra.effetto) - Math.abs(una.effetto))
    .slice(0, quante);
}

/**
 * Le cause del numero di una lettura, dalla piu' grande.
 *
 * **Sul totale non si sommano i contributi dei due lati.** Su `log` il totale non e' la
 * somma dei predittori ma la somma dei due esponenziali, e sommare le `eta` darebbe un
 * numero che non e' l'effetto di niente. Si pesano invece gli effetti di lato sull'atteso
 * di ciascun lato: se il lato casa vale A e cambia dell'`a` per cento e il lato trasferta
 * vale B e cambia del `b`, il totale cambia di `(A*a + B*b) / (A + B)`. E' esatto per il
 * collegamento logaritmico ed esatto nelle `eta` per l'identita'.
 */
export function causeDellaLettura(
  lato: 'casa' | 'trasferta' | 'totale',
  casa: EsitoDiProduzione,
  trasferta: EsitoDiProduzione,
  quante = 3,
): readonly Causa[] {
  if (casa.stato !== 'prevista' || trasferta.stato !== 'prevista') return [];
  const diCasa = gruppiDiLato(casa.contributi, casa.predittoreLineare, casa.collegamento);
  if (lato === 'casa') return prime(diCasa, quante);
  const diFuori = gruppiDiLato(
    trasferta.contributi, trasferta.predittoreLineare, trasferta.collegamento,
  );
  if (lato === 'trasferta') return prime(diFuori, quante);

  const pesoCasa = casa.valoreAtteso;
  const pesoFuori = trasferta.valoreAtteso;
  const totale = pesoCasa + pesoFuori;
  if (!(totale > 0)) return [];

  const pesate = new Map<string, number>();
  for (const [gruppi, peso] of [[diCasa, pesoCasa], [diFuori, pesoFuori]] as const) {
    for (const causa of gruppi) {
      pesate.set(causa.nome, (pesate.get(causa.nome) ?? 0) + causa.effetto * peso / totale);
    }
  }
  return prime([...pesate].map(([nome, effetto]) => ({ nome, effetto })), quante);
}
