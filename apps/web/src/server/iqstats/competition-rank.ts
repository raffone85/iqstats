// Server-only: quanto pesa una competizione quando bisogna sceglierne una sola.
// Serve alla gara in evidenza: con centocinquanta gare al giorno, prendere la prima in
// ordine di orario significa quasi sempre mostrare un'amichevole.
//
// Questa è una scelta editoriale nostra, non un dato della fonte, e non si mostra in
// pagina: decide soltanto quale gara sale in vetrina. Livelli dal più alto (1) al più
// basso (6). Una competizione non elencata vale 4, cioè una prima divisione qualunque.
import "server-only";

const RANK_BY_COMPETITION = new Map<number, number>([
  // 1 — il vertice: mondiali, europei, coppe dei campioni
  [27, 1], [7, 1], [32, 1], [66, 1], [67, 1], [90, 1],
  // 2 — i cinque grandi campionati, le altre coppe continentali, le nazionali
  [1, 2], [3, 2], [4, 2], [5, 2], [6, 2], [8, 2], [83, 2], [33, 2], [29, 2],
  [64, 2], [65, 2], [58, 2], [59, 2], [60, 2], [61, 2], [62, 2], [63, 2],
  [68, 2], [69, 2], [30, 2],
  // 3 — gli altri grandi campionati e le coppe nazionali maggiori
  [2, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [15, 3], [17, 3],
  [18, 3], [19, 3], [20, 3], [85, 3], [35, 3], [39, 3], [41, 3], [42, 3], [43, 3],
  [44, 3], [51, 3],
  // 4 — le altre prime divisioni (valore predefinito, elencate per chiarezza)
  [22, 4], [23, 4], [24, 4], [25, 4], [26, 4], [28, 4], [36, 4], [47, 4], [49, 4],
  [50, 4], [52, 4], [53, 4], [54, 4], [55, 4], [72, 4], [80, 4], [84, 4],
  // 5 — divisioni inferiori, coppe minori, giovanili
  [34, 5], [38, 5], [40, 5], [46, 5], [48, 5], [56, 5], [57, 5], [70, 5], [71, 5],
  [81, 5], [82, 5], [86, 5], [87, 5], [88, 5], [89, 5],
  // 6 — amichevoli: ultime, sempre
  [31, 6], [79, 6],
]);

const DEFAULT_RANK = 4;

/** Peso della competizione: più basso è il numero, più la gara conta. */
export function competitionRank(leagueId: number | null): number {
  if (leagueId === null) return DEFAULT_RANK;
  return RANK_BY_COMPETITION.get(leagueId) ?? DEFAULT_RANK;
}
