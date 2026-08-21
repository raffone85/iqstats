/**
 * Le primitive delle medie «al momento di».
 *
 * Sembrano tre funzioni banali e non lo sono: la libreria usata dal lato che addestra
 * non fa la cosa ingenua, e replicarla male produce numeri simili ma diversi.
 *
 *   - la finestra conta le **gare**, non i valori noti: una gara senza statistiche
 *     occupa il suo posto e riduce il campione;
 *   - la deviazione standard divide per n, non per n meno uno;
 *   - la media esponenziale non salta i valori ignoti: escono dalla somma, ma il loro
 *     posto continua a pesare nell'esponente.
 *
 * Ogni funzione riceve i valori delle gare precedenti, dalla piu' vecchia alla piu'
 * recente, e restituisce `null` quando non c'e' nulla di noto su cui calcolare.
 */

import { MEZZA_VITA_EWMA } from './contratto';

/** Le ultime `finestra` posizioni, o tutte se la finestra non e' indicata. */
function coda(valori: Array<number | null>, finestra?: number): Array<number | null> {
  if (finestra === undefined || finestra >= valori.length) {
    return valori;
  }
  return valori.slice(valori.length - finestra)
}

function noti(valori: Array<number | null>): number[] {
  const dentro: number[] = []
  for (const valore of valori) {
    if (valore !== null && Number.isFinite(valore)) {
      dentro.push(valore)
    }
  }
  return dentro;
}

export function media(valori: Array<number | null>, finestra?: number): number | null {
  const dentro = noti(coda(valori, finestra))
  if (dentro.length === 0) {
    return null;
  }
  let somma = 0;
  for (const valore of dentro) {
    somma += valore;
  }
  return somma / dentro.length;
}

/** Deviazione standard di popolazione: con un solo valore vale zero, non indefinita. */
export function deviazione(valori: Array<number | null>, finestra?: number): number | null {
  const dentro = noti(coda(valori, finestra))
  if (dentro.length === 0) {
    return null;
  }
  let somma = 0;
  for (const valore of dentro) {
    somma += valore;
  }
  const centro = somma / dentro.length;
  let quadrati = 0;
  for (const valore of dentro) {
    quadrati += (valore - centro) * (valore - centro)
  }
  return Math.sqrt(quadrati / dentro.length)
}

export function campione(valori: Array<number | null>, finestra?: number): number {
  return noti(coda(valori, finestra)).length;
}

/**
 * Media esponenziale con mezza vita in gare. I valori ignoti non vengono saltati: la
 * loro posizione continua a contare nella distanza dall'ultima gara.
 */
export function esponenziale(
  valori: Array<number | null>,
  mezzaVita: number = MEZZA_VITA_EWMA,
): number | null {
  if (valori.length === 0) {
    return null;
  }
  const alfa = 1 - Math.pow(2, -1 / mezzaVita)
  const ultima = valori.length - 1;
  let numeratore = 0;
  let denominatore = 0;
  for (let i = 0; i < valori.length; i += 1) {
    const valore = valori[i]
    if (valore === null || !Number.isFinite(valore)) {
      continue;
    }
    const peso = Math.pow(1 - alfa, ultima - i)
    numeratore += peso * valore;
    denominatore += peso;
  }
  if (denominatore === 0) {
    return null;
  }
  return numeratore / denominatore;
}

/** Divisione che dichiara l'assenza invece di produrre un infinito. */
export function rapporto(sopra: number | null, sotto: number | null): number | null {
  if (sopra === null || sotto === null || !Number.isFinite(sopra) || !Number.isFinite(sotto)) {
    return null;
  }
  if (sotto === 0) {
    return null;
  }
  const esito = sopra / sotto;
  return Number.isFinite(esito) ? esito : null;
}

export function differenza(sinistra: number | null, destra: number | null): number | null {
  if (sinistra === null || destra === null) {
    return null;
  }
  return sinistra - destra;
}

/** Il primo valore noto fra quelli indicati, nell'ordine dato. */
export function primoNoto(...valori: Array<number | null>): number | null {
  for (const valore of valori) {
    if (valore !== null && Number.isFinite(valore)) {
      return valore;
    }
  }
  return null;
}
