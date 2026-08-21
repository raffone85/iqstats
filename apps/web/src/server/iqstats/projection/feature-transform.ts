/**
 * Le trasformazioni delle feature, esattamente come le fa l'addestramento.
 *
 * Sono poche e sono tutte qui: l'ordine dichiarato dall'artefatto, il rifiuto dei valori
 * mancanti e non finiti, e la standardizzazione con le medie e le scale salvate.
 *
 * La regola del progetto vale anche qui: un valore mancante non diventa mai zero e non
 * viene mai sostituito. Se manca, la previsione non si produce.
 */

import type { ArtefattoModello, SchemaFeature } from './artifact-schema';

/** Il valore di una feature come arriva da chi chiama: puo' non esserci. */
export type ValoreFeature = number | null | undefined;

export interface FeaturePronte {
  readonly stato: 'pronte';
  readonly grezze: readonly number[];
  readonly standardizzate: readonly number[];
}

export interface FeatureIncomplete {
  readonly stato: 'incomplete';
  readonly mancanti: readonly string[];
  readonly nonFinite: readonly string[];
}

export type EsitoFeature = FeaturePronte | FeatureIncomplete;

/**
 * Divisore della standardizzazione.
 *
 * Una feature costante ha scala zero: l'addestramento la lascia a uno per non dividere
 * per zero, e qui si fa la stessa cosa. Non e' una scelta di comodo, e' la stessa scelta.
 */
function divisore(scala: number): number {
  return scala === 0 ? 1 : scala;
}

/** Mette i valori nell'ordine dichiarato dall'artefatto, senza inventarne nessuno. */
export function ordinaFeature(
  schema: SchemaFeature,
  valori: Readonly<Record<string, ValoreFeature>>,
): readonly ValoreFeature[] {
  return schema.ordine.map((nome) => valori[nome]);
}

/**
 * Verifica e standardizza. Distingue una feature assente da una presente ma non finita,
 * perche' sono due difetti diversi e vanno visti separatamente.
 */
export function preparaFeature(
  schema: SchemaFeature,
  valori: readonly ValoreFeature[],
): EsitoFeature {
  const { ordine, preprocessing } = schema;
  if (valori.length !== ordine.length) {
    return {
      stato: 'incomplete',
      mancanti: ordine.slice(valori.length),
      nonFinite: [],
    };
  }

  const mancanti: string[] = [];
  const nonFinite: string[] = [];
  for (let indice = 0; indice < ordine.length; indice += 1) {
    const valore = valori[indice];
    if (valore === null || valore === undefined) {
      mancanti.push(ordine[indice]);
    } else if (!Number.isFinite(valore)) {
      nonFinite.push(ordine[indice]);
    }
  }
  if (mancanti.length > 0 || nonFinite.length > 0) {
    return { stato: 'incomplete', mancanti, nonFinite };
  }

  const grezze = valori as readonly number[];
  const standardizzate = new Array<number>(ordine.length);
  for (let indice = 0; indice < ordine.length; indice += 1) {
    standardizzate[indice] =
      (grezze[indice] - preprocessing.media[indice]) / divisore(preprocessing.scala[indice]);
  }
  return { stato: 'pronte', grezze, standardizzate };
}

/** Prepara le feature di un artefatto a partire da una mappa nome -> valore. */
export function preparaDaNomi(
  artefatto: ArtefattoModello,
  valori: Readonly<Record<string, ValoreFeature>>,
): EsitoFeature {
  return preparaFeature(artefatto.feature_schema, ordinaFeature(artefatto.feature_schema, valori));
}

/**
 * Il predittore lineare: intercetta piu' prodotto scalare, nell'ordine dichiarato.
 *
 * L'addestramento somma con la libreria numerica, che raggruppa i termini a modo suo:
 * i due risultati non hanno gli stessi bit e non devono averli. La differenza vive nel
 * rumore dell'ultima cifra ed e' quello che la tolleranza relativa dichiarata misura.
 */
export function predittoreLineare(
  standardizzate: readonly number[],
  coefficienti: readonly number[],
  intercetta: number,
): number {
  let somma = 0;
  for (let indice = 0; indice < standardizzate.length; indice += 1) {
    somma += standardizzate[indice] * coefficienti[indice];
  }
  return somma + intercetta;
}
