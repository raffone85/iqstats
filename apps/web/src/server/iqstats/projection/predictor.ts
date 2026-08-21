/**
 * La previsione, dall'artefatto ai numeri che l'applicazione mostra.
 *
 * Qui non si addestra niente e non si decide niente: si rifa' esattamente il calcolo che
 * l'addestramento ha gia' fatto, leggendolo dall'artefatto. Se il calcolo non e'
 * riproducibile, il modello non entra in produzione: e' la regola, non un'eccezione.
 *
 * Modulo puro: nessuna dipendenza dall'applicazione, nessun accesso a rete o disco.
 */

import type { ArtefattoModello, DistribuzioneIntervallo } from './artifact-schema';
import type { EsitoFeature, ValoreFeature } from './feature-transform';
import { predittoreLineare, preparaDaNomi, preparaFeature } from './feature-transform';

/** Il valore atteso non scende mai sotto questa soglia prima del calcolo dell'intervallo. */
const ATTESO_MINIMO = 1e-6;

/** Limite di sicurezza alla somma dei quantili: nessun conteggio calcistico lo raggiunge. */
const CONTEGGIO_MASSIMO = 100000;

export interface Intervallo {
  readonly basso: number;
  readonly alto: number;
  readonly livelloNominale: number;
  readonly livelloDichiarato: number;
}

export interface Proiezione {
  readonly stato: 'prevista';
  readonly modelId: string;
  readonly target: string;
  readonly predittoreLineare: number;
  readonly valoreAtteso: number;
  readonly intervallo: Intervallo;
}

export interface NonPrevista {
  readonly stato: 'non_prevista';
  readonly modelId: string;
  readonly target: string;
  readonly motivo: 'feature_mancanti' | 'feature_non_finite';
  readonly featureMancanti: readonly string[];
  readonly featureNonFinite: readonly string[];
}

export type EsitoProiezione = Proiezione | NonPrevista;

/**
 * Quantile della distribuzione di Poisson: il piu' piccolo conteggio la cui probabilita'
 * cumulata raggiunge il livello richiesto.
 *
 * La cumulata si somma termine a termine con la ricorrenza della densita': su conteggi
 * calcistici sono poche decine di termini, ed e' esatta quanto la formula chiusa.
 */
export function quantilePoisson(livello: number, media: number): number {
  const mu = Math.max(media, ATTESO_MINIMO);
  if (livello <= 0) {
    return 0;
  }
  let densita = Math.exp(-mu);
  let cumulata = densita;
  let conteggio = 0;
  while (cumulata < livello && conteggio < CONTEGGIO_MASSIMO) {
    conteggio += 1;
    densita = (densita * mu) / conteggio;
    cumulata += densita;
  }
  return conteggio;
}

/**
 * Quantile della binomiale negativa nella parametrizzazione dell'addestramento:
 * `numeroSuccessi` prove riuscite e probabilita' `probabilita` per prova.
 */
export function quantileBinomialeNegativa(
  livello: number,
  numeroSuccessi: number,
  probabilita: number,
): number {
  if (livello <= 0) {
    return 0;
  }
  let densita = Math.pow(probabilita, numeroSuccessi);
  let cumulata = densita;
  let conteggio = 0;
  while (cumulata < livello && conteggio < CONTEGGIO_MASSIMO) {
    conteggio += 1;
    densita = (densita * (conteggio + numeroSuccessi - 1) * (1 - probabilita)) / conteggio;
    cumulata += densita;
  }
  return conteggio;
}

/**
 * Cumulata di Poisson: la probabilita' di non superare un conteggio.
 *
 * Stessa ricorrenza del quantile, percorsa fino al conteggio invece che fino al livello.
 * Serve alle probabilita' delle soglie, che non sono un quantile: il quantile risponde
 * «quale conteggio», la cumulata risponde «con quale probabilita'».
 */
export function cumulataPoisson(conteggio: number, media: number): number {
  const mu = Math.max(media, ATTESO_MINIMO);
  const limite = Math.floor(conteggio);
  if (limite < 0) {
    return 0;
  }
  let densita = Math.exp(-mu);
  let cumulata = densita;
  for (let k = 1; k <= limite && k < CONTEGGIO_MASSIMO; k += 1) {
    densita = (densita * mu) / k;
    cumulata += densita;
  }
  return cumulata > 1 ? 1 : cumulata;
}

/** Cumulata della binomiale negativa, nella parametrizzazione dell'addestramento. */
export function cumulataBinomialeNegativa(
  conteggio: number,
  numeroSuccessi: number,
  probabilita: number,
): number {
  const limite = Math.floor(conteggio);
  if (limite < 0) {
    return 0;
  }
  let densita = Math.pow(probabilita, numeroSuccessi);
  let cumulata = densita;
  for (let k = 1; k <= limite && k < CONTEGGIO_MASSIMO; k += 1) {
    densita = (densita * (k + numeroSuccessi - 1) * (1 - probabilita)) / k;
    cumulata += densita;
  }
  return cumulata > 1 ? 1 : cumulata;
}

/**
 * La probabilita' di superare una soglia, letta dalla distribuzione calibrata.
 *
 * **Il livello nominale non entra qui.** Quel livello corregge gli estremi
 * dell'intervallo, che su una distribuzione discreta sono conservativi per costruzione:
 * e' una correzione degli estremi, non della funzione di ripartizione. Applicarlo anche
 * alle probabilita' le sposterebbe tutte nella stessa direzione senza che nessuno lo
 * abbia misurato.
 */
export function probabilitaSopra(
  distribuzione: DistribuzioneIntervallo,
  dispersione: number,
  valoreAtteso: number,
  soglia: number,
): number {
  const media = Math.max(valoreAtteso, ATTESO_MINIMO);
  const sotto = distribuzione === 'poisson'
    ? cumulataPoisson(soglia, media)
    : cumulataBinomialeNegativa(soglia, media / (dispersione - 1), 1 / dispersione);
  const sopra = 1 - sotto;
  if (sopra < 0) {
    return 0;
  }
  return sopra > 1 ? 1 : sopra;
}

/**
 * Estremi dell'intervallo centrale al livello nominale dell'artefatto.
 *
 * Su una distribuzione discreta l'intervallo e' conservativo per costruzione: per questo
 * il livello nominale salvato non coincide con quello dichiarato all'utente, ed e' stato
 * calibrato sul solo periodo di addestramento.
 */
export function intervalloDi(artefatto: ArtefattoModello, valoreAtteso: number): Intervallo {
  const { calibration } = artefatto;
  return intervalloDaParametri(
    calibration.distribuzione_intervallo,
    calibration.dispersione,
    calibration.livello_nominale,
    calibration.livello_dichiarato,
    valoreAtteso,
  );
}

/**
 * Gli stessi estremi, a partire da parametri dichiarati altrove che nella calibrazione
 * complessiva: e' il caso della fascia di maturita', che ha dispersione e livello suoi
 * perche' l'errore con poco storico non ha la stessa forma.
 */
export function intervalloDaParametri(
  distribuzione: DistribuzioneIntervallo,
  dispersione: number,
  livelloNominale: number,
  livelloDichiarato: number,
  valoreAtteso: number,
): Intervallo {
  const coda = (1 - livelloNominale) / 2;
  const media = Math.max(valoreAtteso, ATTESO_MINIMO);

  let basso: number;
  let alto: number;
  if (distribuzione === 'poisson') {
    basso = quantilePoisson(coda, media);
    alto = quantilePoisson(1 - coda, media);
  } else {
    const probabilita = 1 / dispersione;
    const numeroSuccessi = media / (dispersione - 1);
    basso = quantileBinomialeNegativa(coda, numeroSuccessi, probabilita);
    alto = quantileBinomialeNegativa(1 - coda, numeroSuccessi, probabilita);
  }

  return { basso, alto, livelloNominale, livelloDichiarato };
}

/** Applica il collegamento e poi il taglio dichiarato, in quest'ordine. */
function valoreAttesoDa(artefatto: ArtefattoModello, eta: number): number {
  const grezzo = artefatto.collegamento === 'log' ? Math.exp(eta) : eta;
  const { minimo, massimo } = artefatto.taglio;
  let valore = grezzo;
  if (minimo !== null && valore < minimo) {
    valore = minimo;
  }
  if (massimo !== null && valore > massimo) {
    valore = massimo;
  }
  return valore;
}

function daEsitoFeature(artefatto: ArtefattoModello, esito: EsitoFeature): EsitoProiezione {
  if (esito.stato === 'incomplete') {
    return {
      stato: 'non_prevista',
      modelId: artefatto.model_id,
      target: artefatto.target,
      motivo: esito.mancanti.length > 0 ? 'feature_mancanti' : 'feature_non_finite',
      featureMancanti: esito.mancanti,
      featureNonFinite: esito.nonFinite,
    };
  }

  const eta = predittoreLineare(esito.standardizzate, artefatto.coefficients, artefatto.intercept);
  const valoreAtteso = valoreAttesoDa(artefatto, eta);
  return {
    stato: 'prevista',
    modelId: artefatto.model_id,
    target: artefatto.target,
    predittoreLineare: eta,
    valoreAtteso,
    intervallo: intervalloDi(artefatto, valoreAtteso),
  };
}

/** Previsione a partire dai valori gia' nell'ordine dichiarato dall'artefatto. */
export function prevediDaOrdine(
  artefatto: ArtefattoModello,
  valori: readonly ValoreFeature[],
): EsitoProiezione {
  return daEsitoFeature(artefatto, preparaFeature(artefatto.feature_schema, valori));
}

/** Previsione a partire da una mappa nome della feature -> valore. */
export function prevedi(
  artefatto: ArtefattoModello,
  valori: Readonly<Record<string, ValoreFeature>>,
): EsitoProiezione {
  return daEsitoFeature(artefatto, preparaDaNomi(artefatto, valori));
}
