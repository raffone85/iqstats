// Le poche regole della lingua che il prodotto scrive a mano, in un posto solo.

/**
 * L'articolo determinativo davanti a una percentuale: «l'83%», non «il 83%».
 *
 * L'elisione segue **come il numero si legge**, non la cifra: ottantatré comincia per
 * vocale e undici pure, novanta no. Vale per uno, otto, undici, diciotto e tutta la
 * decina dell'ottanta, che sono i casi che capitano fra zero e cento.
 *
 * Sta qui perche' la stessa frase - «in questa lega succede il N% delle volte» - vive nel
 * dossier e nella vetrina, e scriverla due volte voleva dire sbagliarla due volte.
 */
export function articoloDiPercentuale(numero: number): string {
  const n = Math.abs(Math.round(numero));
  const vocale = n === 1 || n === 8 || n === 11 || n === 18 || (n >= 80 && n <= 89);
  return vocale ? "l’" : "il ";
}
